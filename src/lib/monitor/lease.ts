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

export async function updateMonitorHealth(update: { ownerId?: string; status?: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error"; pipelineConnected?: boolean; lastPipelineEventAt?: Date; lastReconciledAt?: Date; lastError?: string }): Promise<void> {
    await ensureMongoSchema();
    const set = { ...update, updatedAt: new Date() };
    await collections(await getMongoDatabase()).monitorState.updateOne({ _id: "singleton" }, { $set: set });
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
