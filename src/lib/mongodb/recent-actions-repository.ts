import "server-only";

import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export type RecentAction = "friend-request";

export async function recordRecentAction(ownerId: string, userId: string, action: RecentAction, occurredAt = new Date()) {
    await ensureMongoSchema();
    const expiresAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1_000);
    await collections(await getMongoDatabase()).recentActions.updateOne({ ownerId, userId, action }, { $set: { ownerId, userId, action, occurredAt, expiresAt, updatedAt: occurredAt }, $setOnInsert: { _id: `${ownerId}:${userId}:${action}` } }, { upsert: true });
    return occurredAt;
}

export async function getRecentActionAt(ownerId: string, userId: string, action: RecentAction) {
    await ensureMongoSchema();
    return (await collections(await getMongoDatabase()).recentActions.findOne({ ownerId, userId, action }))?.occurredAt ?? null;
}
