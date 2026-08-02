import "server-only";

import WebSocket from "ws";
import { z } from "zod";

import { enrichGameSession, observeGameSession } from "@/lib/game-log/session-repository";
import { clearStoredVrchatSession, getStoredVrchatSession, updateStoredVrchatCookies } from "@/lib/mongodb/session-repository";
import { applyPipelineNotificationState, upsertPipelineNotification } from "@/lib/notifications/repository";
import { requestVrchat, VrchatApiError, type VrchatCookies } from "@/lib/vrchat/client";
import { vrchatNotificationSchema } from "@/lib/vrchat/types";
import { applyPipelineFriendEvent, isPipelineFriendEventType } from "./friend-events";
import { acquireMonitorLease, updateMonitorHealth } from "./lease";
import { resolveLocationMetadata } from "./location-metadata";
import { reconcileRemoteState } from "./reconcile";

import { randomUUID } from "node:crypto";

const PIPELINE_URL = "wss://pipeline.vrchat.cloud/";
const LEASE_RENEWAL_MS = 20_000;
const RECONCILIATION_MS = 120_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

const pipelineEnvelopeSchema = z.object({
    type: z.string(),
    content: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

type MonitorGlobal = typeof globalThis & {
    __vrcxMonitor?: AlwaysOnMonitor;
};

const monitorGlobal = globalThis as MonitorGlobal;

class AlwaysOnMonitor {
    private readonly leaderId = `${process.pid}:${randomUUID()}`;
    private leaseTimer?: NodeJS.Timeout;
    private reconciliationTimer?: NodeJS.Timeout;
    private reconnectTimer?: NodeJS.Timeout;
    private socket?: WebSocket;
    private pipelineGeneration = 0;
    private cookies?: VrchatCookies;
    private ownerId?: string;
    private reconnectAttempt = 0;
    private started = false;
    private hasLeadership = false;
    private reconciliationPromise?: Promise<void>;
    private pipelineTail: Promise<void> = Promise.resolve();

    start() {
        if (this.started) return;
        this.started = true;
        void this.tickLeadership();
        this.leaseTimer = setInterval(() => void this.tickLeadership(), LEASE_RENEWAL_MS);
        this.leaseTimer.unref();
    }

    private async tickLeadership() {
        try {
            if (!(await acquireMonitorLease(this.leaderId))) {
                this.hasLeadership = false;
                this.disconnect();
                return;
            }
            const becameLeader = !this.hasLeadership;
            this.hasLeadership = true;
            const stored = await getStoredVrchatSession();
            if (stored?.status !== "authenticated" || !stored.activeUserId) {
                this.cookies = undefined;
                this.ownerId = undefined;
                this.disconnect();
                await this.safeHealth({ status: "authentication-required", pipelineConnected: false });
                return;
            }
            if (becameLeader || !this.cookies || this.ownerId !== stored.activeUserId) await this.loadSessionAndStart(stored);
            else if (!this.reconciliationPromise && !this.socket && !this.reconnectTimer) await this.connectPipeline();
        } catch {
            // Fail closed when MongoDB cannot prove leadership. Continuing an
            // old socket could create duplicate ingestion after another
            // process acquires the expired lease.
            this.hasLeadership = false;
            this.disconnect();
            await this.safeHealth({ status: "error", pipelineConnected: false, lastError: "Monitor leadership or startup failed." });
        }
    }

    private async loadSessionAndStart(stored: NonNullable<Awaited<ReturnType<typeof getStoredVrchatSession>>>) {
        // Account replacement and lease reacquisition both require a fresh
        // baseline before accepting realtime events from a new socket.
        this.disconnect();
        this.cookies = stored.cookies;
        this.ownerId = stored.activeUserId;
        await this.safeHealth({ ownerId: this.ownerId, status: "starting", pipelineConnected: false, lastError: "" });
        const priorReconciliation = this.reconciliationPromise;
        if (priorReconciliation) await priorReconciliation;
        await this.reconcile();
        if (!this.cookies || !this.ownerId || !this.hasLeadership) return;
        await this.connectPipeline();
        this.reconciliationTimer ??= setInterval(() => void this.reconcile(), RECONCILIATION_MS);
        this.reconciliationTimer.unref();
    }

    private reconcile(): Promise<void> {
        if (!this.hasLeadership || !this.cookies) return Promise.resolve();
        if (this.reconciliationPromise) return this.reconciliationPromise;
        const cookies = this.cookies;
        const ownerId = this.ownerId;
        const generation = this.pipelineGeneration;
        const reconciliation = this.performReconciliation(cookies, ownerId, generation);
        const tracked = reconciliation.finally(() => {
            if (this.reconciliationPromise === tracked) {
                this.reconciliationPromise = undefined;
            }
        });
        this.reconciliationPromise = tracked;
        return tracked;
    }

    private async performReconciliation(cookies: VrchatCookies, ownerId: string | undefined, generation: number) {
        try {
            const result = await reconcileRemoteState(cookies, `${this.leaderId}:reconcile`);
            if (!result) return;
            if (!this.hasLeadership || generation !== this.pipelineGeneration || ownerId !== this.ownerId) return;
            this.cookies = result.cookies;
            this.ownerId = result.user.id;
            await this.safeHealth({ ownerId: result.user.id, status: this.socket?.readyState === WebSocket.OPEN ? "healthy" : "reconnecting", lastReconciledAt: new Date(), lastError: "" });
        } catch (error) {
            if (error instanceof VrchatApiError && error.status === 401) {
                if (!this.hasLeadership || generation !== this.pipelineGeneration || ownerId !== this.ownerId) return;
                this.cookies = undefined;
                this.ownerId = undefined;
                this.disconnect();
                await clearStoredVrchatSession({ activeUserId: ownerId, authCookie: cookies.auth });
                await this.safeHealth({ status: "authentication-required", pipelineConnected: false, lastError: "VRChat session expired." });
                return;
            }
            if (!this.hasLeadership || generation !== this.pipelineGeneration || ownerId !== this.ownerId) return;
            await this.safeHealth({ status: "error", lastError: "VRChat reconciliation failed." });
        }
    }

    private async connectPipeline() {
        if (!this.hasLeadership || !this.cookies || !this.ownerId || this.socket) return;
        const cookies = this.cookies;
        const ownerId = this.ownerId;
        const generationAtStart = this.pipelineGeneration;
        const auth = await requestVrchat<unknown>("auth", { cookies });
        if (!this.hasLeadership || this.ownerId !== ownerId || this.pipelineGeneration !== generationAtStart) return;
        this.cookies = { ...cookies, ...auth.cookies };
        await updateStoredVrchatCookies(this.cookies, { activeUserId: ownerId, authCookie: cookies.auth });
        const parsed = z.object({ ok: z.boolean(), token: z.string().min(1) }).parse(auth.data);
        if (!parsed.ok) throw new Error("VRChat did not issue a Pipeline token.");

        const socket = new WebSocket(`${PIPELINE_URL}?auth=${encodeURIComponent(parsed.token)}`);
        const generation = ++this.pipelineGeneration;
        this.socket = socket;
        socket.on("open", () => {
            if (this.socket !== socket || generation !== this.pipelineGeneration) return;
            this.reconnectAttempt = 0;
            void this.safeHealth({ status: "healthy", pipelineConnected: true, lastError: "" });
        });
        socket.on("message", (data) => {
            const receivedAt = new Date();
            this.pipelineTail = this.pipelineTail
                .then(() => this.handlePipelineMessage(data.toString(), receivedAt, generation, ownerId))
                .catch(async () => {
                    await this.safeHealth({ status: "error", lastError: "A Pipeline event could not be processed." });
                    void this.reconcile();
                });
        });
        socket.on("error", () => socket.close());
        socket.on("close", () => {
            // disconnect() invalidates the generation before closing. Ignore
            // late callbacks from the prior leader or active VRChat identity.
            if (this.socket !== socket || generation !== this.pipelineGeneration) return;
            this.socket = undefined;
            void this.safeHealth({ status: "reconnecting", pipelineConnected: false });
            void this.reconcile();
            this.scheduleReconnect();
        });
    }

    private async handlePipelineMessage(raw: string, receivedAt: Date, generation: number, ownerId: string) {
        if (generation !== this.pipelineGeneration || ownerId !== this.ownerId || !this.hasLeadership) return;
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            return;
        }
        const envelope = pipelineEnvelopeSchema.safeParse(json);
        if (!envelope.success) return;
        let parsedContent: unknown;
        try {
            parsedContent = typeof envelope.data.content === "string" ? JSON.parse(envelope.data.content) : envelope.data.content;
        } catch {
            return;
        }

        const now = receivedAt;
        await this.safeHealth({ status: "healthy", pipelineConnected: true, lastPipelineEventAt: now });
        if (generation !== this.pipelineGeneration || ownerId !== this.ownerId || !this.hasLeadership) return;
        const content = z.record(z.string(), z.unknown()).safeParse(parsedContent);
        if (envelope.data.type === "user-location" && content.success && content.data.userId === ownerId) {
            const location = typeof content.data.location === "string" ? content.data.location : undefined;
            await observeGameSession({ ownerId, location, observedAt: now, provenance: "pipeline" });
            const expectedAuthCookie = this.cookies?.auth;
            const metadata = this.cookies ? await resolveLocationMetadata(ownerId, location, this.cookies) : { cookies: this.cookies ?? {} };
            if (generation !== this.pipelineGeneration || ownerId !== this.ownerId || !this.hasLeadership) return;
            this.cookies = metadata.cookies;
            await updateStoredVrchatCookies(metadata.cookies, { activeUserId: ownerId, authCookie: expectedAuthCookie });
            await enrichGameSession(ownerId, location, metadata);
            return;
        }

        if (this.ownerId && content.success && (envelope.data.type === "notification" || envelope.data.type === "notification-v2")) {
            const notification = vrchatNotificationSchema.safeParse(content.data);
            if (notification.success) {
                await upsertPipelineNotification(this.ownerId, envelope.data.type === "notification-v2" ? "v2" : "legacy", notification.data, now);
            }
            return;
        }

        if (this.ownerId && content.success && envelope.data.type === "notification-v2-delete") {
            const ids = z.array(z.string()).safeParse(content.data.ids);
            if (ids.success) await applyPipelineNotificationState(this.ownerId, ids.data, "v2", "hidden", now);
            return;
        }

        if (this.ownerId && envelope.data.type === "see-notification") {
            const id = typeof parsedContent === "string" ? parsedContent : content.success && typeof content.data.id === "string" ? content.data.id : undefined;
            if (id) await applyPipelineNotificationState(this.ownerId, [id], "legacy", "seen", now);
            return;
        }

        if (this.ownerId && envelope.data.type === "hide-notification") {
            const id = typeof parsedContent === "string" ? parsedContent : content.success && typeof content.data.id === "string" ? content.data.id : undefined;
            if (id) await applyPipelineNotificationState(this.ownerId, [id], "legacy", "hidden", now);
            return;
        }

        if (this.ownerId && content.success && envelope.data.type === "response-notification" && typeof content.data.notificationId === "string") {
            await applyPipelineNotificationState(this.ownerId, [content.data.notificationId], "legacy", "hidden", now);
            return;
        }

        if (this.ownerId && content.success && isPipelineFriendEventType(envelope.data.type)) {
            if (await applyPipelineFriendEvent(this.ownerId, envelope.data.type, content.data, now)) return;
        }

        if (envelope.data.type.startsWith("friend-") || envelope.data.type.startsWith("group-") || envelope.data.type === "notification-v2-update" || envelope.data.type === "user-update") {
            // Reconciliation applies the same typed projection path and
            // deduplicates results, while coalescing noisy Pipeline bursts.
            void this.reconcile();
        }
    }

    private scheduleReconnect() {
        if (!this.hasLeadership || this.reconnectTimer || !this.cookies) return;
        const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt++);
        const delay = Math.round(base * (0.8 + Math.random() * 0.4));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.connectPipeline().catch(() => this.scheduleReconnect());
        }, delay);
        this.reconnectTimer.unref();
    }

    private disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.pipelineGeneration += 1;
        this.socket?.close();
        this.socket = undefined;
        if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
        this.reconciliationTimer = undefined;
    }

    private async safeHealth(update: Parameters<typeof updateMonitorHealth>[1]) {
        try {
            await updateMonitorHealth(this.leaderId, update);
        } catch {
            // Health reporting must never create an unhandled rejection that
            // terminates the long-running monitor process.
        }
    }
}

export function startAlwaysOnMonitor() {
    monitorGlobal.__vrcxMonitor ??= new AlwaysOnMonitor();
    monitorGlobal.__vrcxMonitor.start();
}
