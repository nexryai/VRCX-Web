import "server-only";

import type { VrchatAvatarStyle } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getAvatarStyleSnapshot(ownerId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).avatarStyleSnapshots.findOne({ _id: ownerId, ownerId });
}

export async function replaceAvatarStyleSnapshot(ownerId: string, styles: VrchatAvatarStyle[], observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).avatarStyleSnapshots.updateOne({ _id: ownerId }, { $set: { ownerId, styles, observedAt, updatedAt: observedAt } }, { upsert: true });
}
