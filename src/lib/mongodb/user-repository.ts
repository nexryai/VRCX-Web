import "server-only";

import type { VrchatUser } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections, type UserDocument } from "./collections";
import { ensureMongoSchema } from "./migrations";

type UserSource = UserDocument["source"];

export async function upsertCachedUser(ownerId: string, user: VrchatUser, source: UserSource, observedAt = new Date()) {
    await upsertCachedUsers(ownerId, [user], source, observedAt);
}

export async function upsertCachedUsers(ownerId: string, users: VrchatUser[], source: UserSource, observedAt = new Date()) {
    if (!users.length) return;
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).users;
    const uniqueUsers = [...new Map(users.map((user) => [user.id, user])).values()];
    const ids = uniqueUsers.map((user) => `${ownerId}:${user.id}`);
    const existing = await collection.find({ _id: { $in: ids } }, { projection: { _id: 1, updatedAt: 1 } }).toArray();
    const existingById = new Map(existing.map((document) => [document._id, document.updatedAt]));
    const operations = uniqueUsers.flatMap((user) => {
        const document: UserDocument = {
            _id: `${ownerId}:${user.id}`,
            ownerId,
            userId: user.id,
            user,
            source,
            observedAt,
            updatedAt: observedAt,
        };
        const previousVersion = existingById.get(document._id);
        if (previousVersion && previousVersion > observedAt) return [];
        return [{ updateOne: { filter: previousVersion ? { _id: document._id, updatedAt: previousVersion } : { _id: document._id }, update: previousVersion ? { $set: document } : { $setOnInsert: document }, upsert: !previousVersion } }];
    });
    if (operations.length) await collection.bulkWrite(operations, { ordered: false });
}

export async function getCachedUser(ownerId: string, userId: string): Promise<VrchatUser | null> {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).users.findOne({ _id: `${ownerId}:${userId}` });
    return document?.user ?? null;
}

export async function patchCachedUser(ownerId: string, userId: string, fields: Partial<VrchatUser>, updatedAt = new Date()) {
    await ensureMongoSchema();
    const updates = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`user.${key}`, value]));
    if (!Object.keys(updates).length) return;
    const c = collections(await getMongoDatabase());
    await Promise.all([c.users.updateOne({ _id: `${ownerId}:${userId}` }, { $set: { ...updates, updatedAt } }), c.friendSnapshots.updateOne({ _id: `${ownerId}:${userId}` }, { $set: { ...updates, updatedAt } })]);
}
