import "server-only";

import type { VrchatPublicProfile } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getCachedPublicProfile(ownerId: string, userId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).publicProfileSnapshots.findOne({ _id: `${ownerId}:${userId}` });
}

export async function replaceCachedPublicProfile(ownerId: string, userId: string, profile: VrchatPublicProfile, observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).publicProfileSnapshots.updateOne({ _id: `${ownerId}:${userId}` }, { $set: { ownerId, userId, profile, observedAt, updatedAt: observedAt } }, { upsert: true });
}
