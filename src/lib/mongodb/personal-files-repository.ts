import "server-only";

import type { VrchatFile } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getPersonalGallerySnapshot(ownerId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).personalFileSnapshots.findOne({ _id: `${ownerId}:gallery`, ownerId, tag: "gallery" });
}

export async function replacePersonalGallerySnapshot(ownerId: string, files: VrchatFile[], observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).personalFileSnapshots.updateOne({ _id: `${ownerId}:gallery` }, { $set: { ownerId, tag: "gallery", files, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function upsertPersonalGalleryFile(ownerId: string, file: VrchatFile, observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).personalFileSnapshots;
    const result = await collection.updateOne({ _id: `${ownerId}:gallery`, ownerId, tag: "gallery" }, [
        {
            $set: {
                files: { $slice: [{ $concatArrays: [[file], { $filter: { input: "$files", as: "existing", cond: { $ne: ["$$existing.id", file.id] } } }] }, 100] },
                observedAt,
                updatedAt: observedAt,
            },
        },
    ]);
    return result.matchedCount === 1;
}
