import "server-only";

import { getMongoDatabase } from "./client";
import { collections, type EntityMemoDocument } from "./collections";
import { ensureMongoSchema } from "./migrations";

export type MemoEntityType = EntityMemoDocument["entityType"];

export async function getEntityMemo(ownerId: string, entityType: MemoEntityType, entityId: string) {
    await ensureMongoSchema();
    return (await collections(await getMongoDatabase()).entityMemos.findOne({ _id: `${ownerId}:${entityType}:${entityId}` }))?.memo || "";
}

export async function saveEntityMemo(ownerId: string, entityType: MemoEntityType, entityId: string, value: string) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).entityMemos;
    const memo = value.trim();
    const _id = `${ownerId}:${entityType}:${entityId}`;
    if (!memo) {
        await collection.deleteOne({ _id });
        return "";
    }
    const now = new Date();
    await collection.updateOne({ _id }, { $set: { ownerId, entityType, entityId, memo, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    return memo;
}
