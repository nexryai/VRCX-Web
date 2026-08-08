import "server-only";

import { z } from "zod";

import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { getMongoDatabase } from "./client";
import { collections, type EncryptedValue } from "./collections";
import { ensureMongoSchema } from "./migrations";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const storedCookiesSchema = z.object({
    auth: z.string().optional(),
    twoFactorAuth: z.string().optional(),
});

function encryptionKey(): Buffer {
    const configured = process.env.VRCHAT_SESSION_ENCRYPTION_KEY?.trim();
    if (!configured) {
        throw new Error("VRCHAT_SESSION_ENCRYPTION_KEY is required to persist the VRChat session.");
    }

    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) {
        throw new Error("VRCHAT_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
    return key;
}

function encryptCookies(cookies: VrchatCookies): EncryptedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cookies), "utf8"), cipher.final()]);
    return {
        algorithm: "aes-256-gcm",
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
}

function decryptCookies(value: EncryptedValue): VrchatCookies {
    if (value.algorithm !== "aes-256-gcm") throw new Error("Unsupported stored session encryption algorithm.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
    return storedCookiesSchema.parse(JSON.parse(plaintext));
}

export async function savePendingVrchatSession(cookies: VrchatCookies): Promise<void> {
    if (!cookies.auth) throw new Error("VRChat did not return an authentication cookie.");
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const now = new Date();
    await c.vrchatSession.updateOne(
        { _id: "singleton" },
        {
            $set: {
                schemaVersion: 1,
                status: "pending-two-factor",
                encryptedCookies: encryptCookies(cookies),
                updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
            $unset: { activeUserId: "" },
        },
        { upsert: true },
    );
}

export async function saveAuthenticatedVrchatSession(cookies: VrchatCookies, userId: string): Promise<void> {
    if (!cookies.auth) throw new Error("VRChat did not return an authentication cookie.");
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const now = new Date();
    const previous = await c.appSettings.findOne({ _id: "singleton" }, { projection: { activeUserId: 1 } });
    const identityChanged = previous?.activeUserId !== userId;
    if (previous?.activeUserId && identityChanged) {
        await c.gameSessions.updateMany(
            { ownerId: previous.activeUserId, current: true },
            {
                $set: {
                    current: false,
                    endedAt: now,
                    endPrecision: "observed",
                    endSource: "reconciliation",
                    closeReason: "identity-change",
                    updatedAt: now,
                },
            },
        );
    }

    await Promise.all([
        c.vrchatSession.updateOne(
            { _id: "singleton" },
            {
                $set: {
                    schemaVersion: 1,
                    status: "authenticated",
                    activeUserId: userId,
                    encryptedCookies: encryptCookies(cookies),
                    updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true },
        ),
        c.appSettings.updateOne({ _id: "singleton" }, { $set: { activeUserId: userId, updatedAt: now } }),
        ...(identityChanged
            ? [
                  c.monitorState.updateOne(
                      { _id: "singleton" },
                      {
                          $set: { ownerId: userId, pipelineSequence: 0, status: "starting", pipelineConnected: false, updatedAt: now },
                          $unset: { lastPipelineEventKey: "", lastPipelineEventType: "", lastPipelineEventAt: "", lastReconciledAt: "", lastAvatarCleanupAt: "", lastAvatarAutoCleanupAt: "", lastAvatarCleanupDeleted: "", lastAvatarCleanupError: "", lastError: "" },
                      },
                  ),
              ]
            : []),
    ]);
}

export async function getStoredVrchatSession(): Promise<{ cookies: VrchatCookies; activeUserId?: string; status: "pending-two-factor" | "authenticated" } | null> {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).vrchatSession.findOne({ _id: "singleton" });
    if (!document) return null;
    return {
        cookies: decryptCookies(document.encryptedCookies),
        activeUserId: document.activeUserId,
        status: document.status,
    };
}

export async function updateStoredVrchatCookies(cookies: VrchatCookies, expected: { activeUserId?: string; authCookie?: string } = {}): Promise<boolean> {
    if (!Object.keys(cookies).length) return false;
    await ensureMongoSchema();
    const sessions = collections(await getMongoDatabase()).vrchatSession;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const document = await sessions.findOne({ _id: "singleton" });
        if (!document) return false;
        const storedCookies = decryptCookies(document.encryptedCookies);
        if (expected.activeUserId && document.activeUserId !== expected.activeUserId) return false;
        if (expected.authCookie && storedCookies.auth !== expected.authCookie) return false;
        const combined = { ...storedCookies, ...cookies };
        if (!combined.auth) return false;
        const result = await sessions.updateOne({ _id: "singleton", "encryptedCookies.ciphertext": document.encryptedCookies.ciphertext }, { $set: { encryptedCookies: encryptCookies(combined), updatedAt: new Date() } });
        if (result.modifiedCount === 1) return true;
        // A concurrent request rotated the same session. Read it again and
        // merge without ever crossing an account replacement boundary.
    }
    return false;
}

export async function clearStoredVrchatSession(expected: { activeUserId?: string; authCookie?: string } = {}): Promise<boolean> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const document = await c.vrchatSession.findOne({ _id: "singleton" });
    if (!document) return false;
    const storedCookies = decryptCookies(document.encryptedCookies);
    if (expected.activeUserId && document.activeUserId !== expected.activeUserId) return false;
    if (expected.authCookie && storedCookies.auth !== expected.authCookie) return false;
    const deleted = await c.vrchatSession.deleteOne({ _id: "singleton", "encryptedCookies.ciphertext": document.encryptedCookies.ciphertext });
    if (deleted.deletedCount !== 1) return false;

    const activeIdentityFilter = document.activeUserId ? { _id: "singleton" as const, activeUserId: document.activeUserId } : { _id: "singleton" as const, updatedAt: { $lte: document.updatedAt } };
    await Promise.all([
        c.appSettings.updateOne(activeIdentityFilter, { $unset: { activeUserId: "" }, $set: { updatedAt: new Date() } }),
        c.monitorState.updateOne(
            { _id: "singleton", ...(document.activeUserId ? { ownerId: document.activeUserId } : {}) },
            {
                $set: {
                    status: "authentication-required",
                    pipelineConnected: false,
                    pipelineSequence: 0,
                    updatedAt: new Date(),
                },
                $unset: { ownerId: "", lastPipelineEventKey: "", lastPipelineEventType: "", lastPipelineEventAt: "", lastReconciledAt: "", lastAvatarCleanupAt: "", lastAvatarAutoCleanupAt: "", lastAvatarCleanupDeleted: "", lastAvatarCleanupError: "", lastError: "" },
            },
        ),
    ]);
    return true;
}
