import "server-only";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";

const LEASE_MS = 60_000;
const RECONCILIATION_LEASE_MS = 5 * 60_000;

export async function acquireMonitorLease(leaderId: string, now = new Date()): Promise<boolean> {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).monitorState.findOneAndUpdate(
        {
            _id: "singleton",
            $or: [{ leaderId }, { leaseExpiresAt: { $lte: now } }, { leaseExpiresAt: { $exists: false } }],
        },
        {
            $set: {
                leaderId,
                leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
                updatedAt: now,
            },
        },
        { returnDocument: "after" },
    );
    return result?.leaderId === leaderId;
}

export async function updateMonitorHealth(leaderId: string, update: { ownerId?: string; status?: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error"; pipelineConnected?: boolean; lastPipelineEventAt?: Date; lastReconciledAt?: Date; lastError?: string }): Promise<void> {
    await ensureMongoSchema();
    const now = new Date();
    const set = { ...update, updatedAt: now };
    await collections(await getMongoDatabase()).monitorState.updateOne({ _id: "singleton", leaderId, leaseExpiresAt: { $gt: now } }, { $set: set });
}

export async function prepareMonitorIdentity(leaderId: string, ownerId: string): Promise<void> {
    await ensureMongoSchema();
    const now = new Date();
    await collections(await getMongoDatabase()).monitorState.updateOne(
        { _id: "singleton", leaderId, leaseExpiresAt: { $gt: now }, ownerId: { $ne: ownerId } },
        {
            $set: { ownerId, pipelineSequence: 0, status: "starting", pipelineConnected: false, updatedAt: now },
            $unset: { lastPipelineEventKey: "", lastPipelineEventType: "", lastPipelineEventAt: "", lastReconciledAt: "", lastAvatarCleanupAt: "", lastAvatarAutoCleanupAt: "", lastAvatarCleanupDeleted: "", lastAvatarCleanupError: "", lastError: "" },
        },
    );
}

export async function advanceMonitorPipelineCursor(leaderId: string, event: { ownerId: string; key: string; type: string; observedAt: Date }): Promise<boolean> {
    await ensureMongoSchema();
    const committedAt = new Date();
    const result = await collections(await getMongoDatabase()).monitorState.updateOne(
        { _id: "singleton", leaderId, leaseExpiresAt: { $gt: committedAt }, ownerId: event.ownerId },
        {
            $inc: { pipelineSequence: 1 },
            $set: {
                lastPipelineEventKey: event.key,
                lastPipelineEventType: event.type,
                lastPipelineEventAt: event.observedAt,
                status: "healthy",
                pipelineConnected: true,
                updatedAt: committedAt,
            },
        },
    );
    return result.modifiedCount === 1;
}

export async function acquireReconciliationLease(owner: string, now = new Date()): Promise<boolean> {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).monitorState.findOneAndUpdate(
        {
            _id: "singleton",
            $or: [{ reconciliationLeaseOwner: owner }, { reconciliationLeaseExpiresAt: { $lte: now } }, { reconciliationLeaseExpiresAt: { $exists: false } }],
        },
        { $set: { reconciliationLeaseOwner: owner, reconciliationLeaseExpiresAt: new Date(now.getTime() + RECONCILIATION_LEASE_MS), updatedAt: now } },
        { returnDocument: "after" },
    );
    return result?.reconciliationLeaseOwner === owner;
}

export async function releaseReconciliationLease(owner: string): Promise<void> {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).monitorState.updateOne({ _id: "singleton", reconciliationLeaseOwner: owner }, { $unset: { reconciliationLeaseOwner: "", reconciliationLeaseExpiresAt: "" }, $set: { updatedAt: new Date() } });
}
