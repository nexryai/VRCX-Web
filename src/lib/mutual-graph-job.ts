import "server-only";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { upsertCachedUsers } from "@/lib/mongodb/user-repository";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

import { randomUUID } from "node:crypto";

const staleJobMilliseconds = 2 * 60_000;
const runningJobs = new Map<string, string>();

type ClaimedMutualGraphJob = {
    jobId: string;
    targetFriendId?: string;
};

export async function claimStaleMutualGraphJob(ownerId: string, now = new Date()): Promise<ClaimedMutualGraphJob | null> {
    await ensureMongoSchema();
    const jobId = randomUUID();
    const claimed = await collections(await getMongoDatabase()).mutualGraph.findOneAndUpdate(
        {
            _id: ownerId,
            ownerId,
            jobStatus: "running",
            jobHeartbeatAt: { $lt: new Date(now.getTime() - staleJobMilliseconds) },
            jobFriendIds: { $exists: true },
            jobRelationships: { $exists: true },
            jobOptedOut: { $exists: true },
        },
        { $set: { jobId, jobCancelRequested: false, jobHeartbeatAt: now }, $unset: { jobError: "" } },
        { returnDocument: "after" },
    );
    return claimed ? { jobId, targetFriendId: claimed.jobTargetFriendId } : null;
}

export async function resumeStaleMutualGraphJob(ownerId: string, initialCookies: VrchatCookies) {
    if (runningJobs.has(ownerId)) return false;
    const claimed = await claimStaleMutualGraphJob(ownerId);
    if (!claimed) return false;
    runningJobs.set(ownerId, claimed.jobId);
    void runMutualGraphJob(ownerId, claimed.jobId, initialCookies, claimed.targetFriendId);
    return true;
}

export async function startMutualGraphJob(ownerId: string, initialCookies: VrchatCookies, targetFriendId?: string) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).mutualGraph;
    const existing = await collection.findOne({ ownerId });
    const heartbeat = existing?.jobHeartbeatAt?.getTime() || 0;
    if (existing?.jobStatus === "running" && Date.now() - heartbeat < staleJobMilliseconds) return false;
    if (runningJobs.has(ownerId)) return false;
    if (existing?.jobStatus === "running" && existing.jobTargetFriendId === targetFriendId) return resumeStaleMutualGraphJob(ownerId, initialCookies);

    const jobId = randomUUID();
    runningJobs.set(ownerId, jobId);
    const now = new Date();
    try {
        await collection.updateOne(
            { _id: ownerId },
            {
                $set: {
                    ownerId,
                    jobId,
                    jobStatus: "running",
                    jobProcessed: 0,
                    jobTotal: 0,
                    jobCancelRequested: false,
                    jobHeartbeatAt: now,
                    jobFriendIds: [],
                    jobRelationships: targetFriendId ? { ...(existing?.relationships || {}) } : {},
                    jobOptedOut: targetFriendId ? (existing?.optedOut || []).filter((id) => id !== targetFriendId) : [],
                    updatedAt: existing?.updatedAt || now,
                    ...(targetFriendId ? { jobTargetFriendId: targetFriendId } : {}),
                },
                $setOnInsert: { relationships: {}, optedOut: [] },
                $unset: { jobError: "", ...(targetFriendId ? {} : { jobTargetFriendId: "" }) },
            },
            { upsert: true },
        );
    } catch (error) {
        if (runningJobs.get(ownerId) === jobId) runningJobs.delete(ownerId);
        throw error;
    }
    void runMutualGraphJob(ownerId, jobId, initialCookies, targetFriendId);
    return true;
}

export async function cancelMutualGraphJob(ownerId: string) {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).mutualGraph.updateOne({ ownerId, jobStatus: "running" }, { $set: { jobCancelRequested: true, jobHeartbeatAt: new Date() } });
    return result.modifiedCount > 0;
}

async function runMutualGraphJob(ownerId: string, jobId: string, initialCookies: VrchatCookies, targetFriendId?: string) {
    const c = collections(await getMongoDatabase());
    let cookies = initialCookies;
    try {
        const previous = await c.mutualGraph.findOne({ ownerId, jobId });
        if (!previous) return;
        const relationships: Record<string, string[]> = { ...(previous.jobRelationships || {}) };
        const optedOut: string[] = [...(previous.jobOptedOut || [])];
        let friendIds = previous.jobFriendIds || [];
        if (!friendIds.length) {
            const friends = await c.friendSnapshots
                .find(targetFriendId ? { ownerId, friendId: targetFriendId } : { ownerId })
                .sort({ friendId: 1 })
                .toArray();
            if (targetFriendId && friends.length !== 1) throw new Error("The selected user is not in the current friend snapshot.");
            friendIds = friends.map((friend) => friend.friendId);
            await c.mutualGraph.updateOne({ ownerId, jobId }, { $set: { jobFriendIds: friendIds, jobTotal: friendIds.length, jobHeartbeatAt: new Date() } });
        }
        const startIndex = Math.min(previous.jobProcessed || 0, friendIds.length);
        for (let index = startIndex; index < friendIds.length; index += 1) {
            const state = await c.mutualGraph.findOne({ ownerId, jobId }, { projection: { jobCancelRequested: 1 } });
            if (!state || state.jobCancelRequested) {
                await c.mutualGraph.updateOne({ ownerId, jobId }, { $set: { jobStatus: "cancelled", jobProcessed: index, jobHeartbeatAt: new Date() } });
                return;
            }
            const friendId = friendIds[index];
            const mutualIds: string[] = [];
            try {
                for (let offset = 0; offset <= 5_000; offset += 100) {
                    const upstream = await requestVrchat<unknown>(`users/${friendId}/mutuals/friends`, { cookies, query: { n: 100, offset } });
                    cookies = { ...cookies, ...upstream.cookies };
                    await persistRotatedVrchatCookies(cookies, initialCookies.auth);
                    // A friend can require many pages. Refresh the durable heartbeat
                    // between pages so another process never mistakes a healthy job
                    // for one abandoned by a terminated server instance.
                    await c.mutualGraph.updateOne({ ownerId, jobId }, { $set: { jobHeartbeatAt: new Date() } });
                    const mutuals = z.array(vrchatUserSchema).parse(upstream.data);
                    await upsertCachedUsers(ownerId, mutuals, "lookup");
                    mutualIds.push(...mutuals.map((user) => user.id).filter((id) => id !== "usr_00000000-0000-0000-0000-000000000000"));
                    if (mutuals.length < 100) break;
                }
                relationships[friendId] = Array.from(new Set(mutualIds));
            } catch (error) {
                if (error instanceof VrchatApiError && (error.status === 403 || error.status === 404)) {
                    delete relationships[friendId];
                    optedOut.push(friendId);
                } else throw error;
            }
            // Keep the last complete snapshot visible while this job runs.
            // VRCX also discards an interrupted fetch rather than exposing a
            // partial graph as though it were complete.
            await c.mutualGraph.updateOne({ ownerId, jobId }, { $set: { jobRelationships: relationships, jobOptedOut: Array.from(new Set(optedOut)), jobProcessed: index + 1, jobTotal: friendIds.length, jobHeartbeatAt: new Date() } });
        }
        const completedAt = new Date();
        await c.mutualGraph.updateOne(
            { ownerId, jobId },
            {
                $set: { relationships, optedOut: Array.from(new Set(optedOut)), jobStatus: "complete", jobProcessed: friendIds.length, jobTotal: friendIds.length, jobCancelRequested: false, jobHeartbeatAt: completedAt, updatedAt: completedAt },
                $unset: { jobFriendIds: "", jobRelationships: "", jobOptedOut: "" },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "The mutual graph job failed.";
        await c.mutualGraph.updateOne({ ownerId, jobId }, { $set: { jobStatus: "error", jobError: message, jobHeartbeatAt: new Date() } });
        if (error instanceof VrchatApiError && error.status === 401 && initialCookies.auth) await clearVrchatSession(initialCookies.auth);
    } finally {
        if (runningJobs.get(ownerId) === jobId) runningJobs.delete(ownerId);
    }
}
