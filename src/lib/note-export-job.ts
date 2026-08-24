import "server-only";

import { MongoServerError } from "mongodb";
import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections, type NoteExportJobDocument, type NoteExportJobItem } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { patchCachedUser } from "@/lib/mongodb/user-repository";
import { type NoteExportCandidate, type NoteExportStartItem, normalizeNote } from "@/lib/note-export";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies } from "@/lib/vrchat/session";

import { randomUUID } from "node:crypto";

const staleJobMilliseconds = 30_000;
const noteDelayMilliseconds = 5_000;
const runningJobs = new Map<string, string>();
const noteResponseSchema = z.object({ note: z.string().optional() }).passthrough();

export async function listNoteExportCandidates(ownerId: string): Promise<NoteExportCandidate[]> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const memos = await c.entityMemos.find({ ownerId, entityType: "user", memo: { $ne: "" } }).toArray();
    if (!memos.length) return [];
    const memoByUserId = new Map(memos.map((memo) => [memo.entityId, normalizeNote(memo.memo)]));
    const friends = await c.friendSnapshots
        .find({ ownerId, friendId: { $in: [...memoByUserId.keys()] } })
        .sort({ "user.displayName": 1, friendId: 1 })
        .toArray();
    return friends.flatMap((friend) => {
        const note = memoByUserId.get(friend.friendId);
        if (!note || friend.user.note === note) return [];
        return [
            {
                userId: friend.friendId,
                displayName: friend.user.displayName,
                imageUrl: friend.user.currentAvatarThumbnailImageUrl || friend.user.profilePicOverride,
                note,
            },
        ];
    });
}

export async function getNoteExportJob(ownerId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).noteExportJobs.findOne({ _id: ownerId, ownerId });
}

export async function startNoteExportJob(ownerId: string, submitted: NoteExportStartItem[]) {
    await ensureMongoSchema();
    const candidates = await listNoteExportCandidates(ownerId);
    const candidateById = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
    const items: NoteExportJobItem[] = submitted.map(({ userId, note }) => {
        const candidate = candidateById.get(userId);
        if (!candidate) throw new NoteExportValidationError("The note export contains a user who is not an eligible current friend.");
        return { userId, displayName: candidate.displayName, imageUrl: candidate.imageUrl, note, status: "pending" };
    });
    const now = new Date();
    const job: NoteExportJobDocument = {
        _id: ownerId,
        ownerId,
        jobId: randomUUID(),
        status: "queued",
        items,
        processed: 0,
        total: items.length,
        cancelRequested: false,
        heartbeatAt: now,
        createdAt: now,
        updatedAt: now,
    };
    try {
        const result = await collections(await getMongoDatabase()).noteExportJobs.replaceOne({ _id: ownerId, status: { $nin: ["queued", "running"] } }, job, { upsert: true });
        return result.modifiedCount === 1 || result.upsertedCount === 1;
    } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return false;
        throw error;
    }
}

export async function cancelNoteExportJob(ownerId: string) {
    await ensureMongoSchema();
    const jobs = collections(await getMongoDatabase()).noteExportJobs;
    const now = new Date();
    const queued = await jobs.updateOne({ _id: ownerId, status: "queued" }, { $set: { status: "cancelled", cancelRequested: true, heartbeatAt: now, updatedAt: now } });
    if (queued.modifiedCount) return true;
    const running = await jobs.updateOne({ _id: ownerId, status: "running" }, { $set: { cancelRequested: true, heartbeatAt: now, updatedAt: now } });
    return running.modifiedCount > 0;
}

export async function resumeNoteExportJob(ownerId: string, initialCookies: VrchatCookies, now = new Date()) {
    if (runningJobs.has(ownerId)) return false;
    const claimed = await claimNoteExportJob(ownerId, now);
    if (!claimed) return false;
    runningJobs.set(ownerId, claimed.executionId);
    void runNoteExportJob(ownerId, claimed.executionId, initialCookies);
    return true;
}

export async function claimNoteExportJob(ownerId: string, now = new Date()) {
    await ensureMongoSchema();
    const executionId = randomUUID();
    // The execution token is a database lease for this job. A second worker
    // may take it only after the prior heartbeat is stale.
    const claimed = await collections(await getMongoDatabase()).noteExportJobs.findOneAndUpdate(
        {
            _id: ownerId,
            ownerId,
            cancelRequested: false,
            $or: [{ status: "queued" }, { status: "running", heartbeatAt: { $lt: new Date(now.getTime() - staleJobMilliseconds) } }],
        },
        { $set: { status: "running", executionId, heartbeatAt: now, updatedAt: now }, $unset: { error: "" } },
        { returnDocument: "after" },
    );
    return claimed ? { executionId } : null;
}

async function runNoteExportJob(ownerId: string, executionId: string, initialCookies: VrchatCookies) {
    const jobs = collections(await getMongoDatabase()).noteExportJobs;
    let cookies = initialCookies;
    let currentName = "";
    try {
        while (true) {
            const job = await jobs.findOne({ _id: ownerId, ownerId, executionId, status: "running" });
            if (!job) return;
            if (job.cancelRequested) {
                await jobs.updateOne({ _id: ownerId, executionId }, { $set: { status: "cancelled", heartbeatAt: new Date(), updatedAt: new Date() }, $unset: { executionId: "", nextRunAt: "" } });
                return;
            }
            if (job.processed >= job.items.length) {
                const completedAt = new Date();
                await jobs.updateOne({ _id: ownerId, executionId }, { $set: { status: "complete", processed: job.items.length, total: job.items.length, cancelRequested: false, heartbeatAt: completedAt, updatedAt: completedAt }, $unset: { executionId: "", nextRunAt: "", error: "" } });
                return;
            }
            // Persist the rate-limit delay before sleeping so a restarted
            // process honors the remainder instead of producing a burst.
            if (job.nextRunAt && job.nextRunAt > new Date()) await wait(job.nextRunAt.getTime() - Date.now());
            const item = job.items[job.processed];
            currentName = item.displayName;
            // Re-read the encrypted session at every item boundary. A job
            // must never continue with cookies from a replaced identity.
            const session = await getStoredVrchatSession();
            if (session?.status !== "authenticated" || session.activeUserId !== ownerId || !session.cookies.auth) throw new NoteExportIdentityError("The active VRChat identity changed before this note could be exported.");
            cookies = session.cookies;
            const expectedAuthCookie = cookies.auth;
            const upstream = await requestVrchat<unknown>("userNotes", { method: "POST", cookies, body: { targetUserId: item.userId, note: item.note } });
            cookies = { ...cookies, ...upstream.cookies };
            await persistRotatedVrchatCookies(upstream.cookies, expectedAuthCookie);
            const note = noteResponseSchema.parse(upstream.data).note ?? item.note;
            await patchCachedUser(ownerId, item.userId, { note });
            const completedAt = new Date();
            const hasMore = job.processed + 1 < job.items.length;
            // Completion advances only after upstream success. A crash in
            // between can repeat the same assignment, which is idempotent,
            // but cannot skip an item or expose partial progress as complete.
            await jobs.updateOne(
                { _id: ownerId, executionId, status: "running", processed: job.processed },
                {
                    $set: {
                        [`items.${job.processed}.status`]: "complete",
                        [`items.${job.processed}.completedAt`]: completedAt,
                        processed: job.processed + 1,
                        heartbeatAt: completedAt,
                        updatedAt: completedAt,
                        ...(hasMore ? { nextRunAt: new Date(completedAt.getTime() + noteDelayMilliseconds) } : {}),
                    },
                    ...(hasMore ? {} : { $unset: { nextRunAt: "" } }),
                },
            );
        }
    } catch (error) {
        const message = `${currentName ? `Name: ${currentName}\n` : ""}${error instanceof Error ? error.message : "The note export failed."}`;
        await jobs.updateOne({ _id: ownerId, executionId, status: "running" }, { $set: { status: "error", error: message, heartbeatAt: new Date(), updatedAt: new Date() }, $unset: { executionId: "", nextRunAt: "" } });
        if (error instanceof VrchatApiError && error.status === 401 && cookies.auth) await clearVrchatSession(cookies.auth);
    } finally {
        if (runningJobs.get(ownerId) === executionId) runningJobs.delete(ownerId);
    }
}

function wait(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

export class NoteExportValidationError extends Error {}
class NoteExportIdentityError extends Error {}
