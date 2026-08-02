import "server-only";

import type { VrchatAvatar, VrchatGroup, VrchatWorld } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { type AvatarDocument, collections, type GroupDocument, type WorldDocument } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function upsertCachedWorlds(ownerId: string, worlds: VrchatWorld[], source: WorldDocument["source"], observedAt = new Date()) {
    if (!worlds.length) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).worlds.bulkWrite(
        worlds.map((world) => {
            const document: WorldDocument = { _id: `${ownerId}:${world.id}`, ownerId, worldId: world.id, world, source, observedAt, updatedAt: observedAt };
            return { updateOne: { filter: { _id: document._id }, update: { $set: document }, upsert: true } };
        }),
        { ordered: false },
    );
}

export async function upsertCachedGroups(ownerId: string, groups: VrchatGroup[], source: GroupDocument["source"], observedAt = new Date()) {
    if (!groups.length) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groups.bulkWrite(
        groups.map((group) => {
            const document: GroupDocument = { _id: `${ownerId}:${group.id}`, ownerId, groupId: group.id, group, source, observedAt, updatedAt: observedAt };
            return { updateOne: { filter: { _id: document._id }, update: { $set: document }, upsert: true } };
        }),
        { ordered: false },
    );
}

export async function upsertCachedAvatars(ownerId: string, avatars: VrchatAvatar[], source: AvatarDocument["source"], observedAt = new Date()) {
    if (!avatars.length) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).avatars.bulkWrite(
        avatars.map((avatar) => {
            const document: AvatarDocument = { _id: `${ownerId}:${avatar.id}`, ownerId, avatarId: avatar.id, avatar, source, observedAt, updatedAt: observedAt };
            return { updateOne: { filter: { _id: document._id }, update: { $set: document }, upsert: true } };
        }),
        { ordered: false },
    );
}

export async function removeCachedAvatar(ownerId: string, avatarId: string) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).avatars.deleteOne({ _id: `${ownerId}:${avatarId}` });
}
