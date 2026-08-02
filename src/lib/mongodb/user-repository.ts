import "server-only";

import type { VrchatUser } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections, type UserDocument } from "./collections";
import { ensureMongoSchema } from "./migrations";

type UserSource = UserDocument["source"];

export async function upsertCachedUser(ownerId: string, user: VrchatUser, source: UserSource, observedAt = new Date()) {
    await ensureMongoSchema();
    const document: UserDocument = {
        _id: `${ownerId}:${user.id}`,
        ownerId,
        userId: user.id,
        user,
        source,
        observedAt,
        updatedAt: observedAt,
    };
    await collections(await getMongoDatabase()).users.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
}

export async function upsertCachedUsers(ownerId: string, users: VrchatUser[], source: UserSource, observedAt = new Date()) {
    if (!users.length) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).users.bulkWrite(
        users.map((user) => {
            const document: UserDocument = {
                _id: `${ownerId}:${user.id}`,
                ownerId,
                userId: user.id,
                user,
                source,
                observedAt,
                updatedAt: observedAt,
            };
            return { updateOne: { filter: { _id: document._id }, update: { $set: document }, upsert: true } };
        }),
        { ordered: false },
    );
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
