import "server-only";

import type { VrchatFile } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getAvatarGallerySnapshot(ownerId: string, avatarId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).avatarGallerySnapshots.findOne({ _id: `${ownerId}:${avatarId}`, ownerId, avatarId });
}

export async function replaceAvatarGallerySnapshot(ownerId: string, avatarId: string, authorId: string, files: VrchatFile[], observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).avatarGallerySnapshots.updateOne({ _id: `${ownerId}:${avatarId}` }, { $set: { ownerId, avatarId, authorId, files, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function upsertAvatarGalleryFile(ownerId: string, avatarId: string, authorId: string, file: VrchatFile, observedAt = new Date()) {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).avatarGallerySnapshots.updateOne(
        { _id: `${ownerId}:${avatarId}`, ownerId, avatarId, authorId },
        [
            {
                $set: {
                    files: { $slice: [{ $concatArrays: [[file], { $filter: { input: { $ifNull: ["$files", []] }, as: "existing", cond: { $ne: ["$$existing.id", file.id] } } }] }, 100] },
                    observedAt,
                    updatedAt: observedAt,
                },
            },
        ],
        { upsert: true },
    );
    return result.acknowledged;
}
