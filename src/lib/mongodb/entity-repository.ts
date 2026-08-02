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

export async function getCachedWorld(ownerId: string, worldId: string) {
    await ensureMongoSchema();
    return (await collections(await getMongoDatabase()).worlds.findOne({ _id: `${ownerId}:${worldId}` }))?.world || null;
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

export async function replaceGroupMemberships(ownerId: string, groups: VrchatGroup[], observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groups;
    const groupIds = groups.map((group) => group.id);
    if (groups.length) {
        await collection.bulkWrite(
            groups.map((group) => ({
                updateOne: {
                    filter: { _id: `${ownerId}:${group.id}` },
                    update: {
                        $set: { ownerId, groupId: group.id, group, source: "membership" as const, membershipActive: true, membershipObservedAt: observedAt, observedAt, updatedAt: observedAt },
                    },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
    }
    await collection.updateMany({ ownerId, membershipActive: true, ...(groupIds.length ? { groupId: { $nin: groupIds } } : {}) }, { $set: { membershipActive: false, membershipObservedAt: observedAt, updatedAt: observedAt } });
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

export async function getCachedAvatar(ownerId: string, avatarId: string) {
    await ensureMongoSchema();
    return (await collections(await getMongoDatabase()).avatars.findOne({ _id: `${ownerId}:${avatarId}` }))?.avatar || null;
}

export async function removeCachedAvatar(ownerId: string, avatarId: string) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).avatars.deleteOne({ _id: `${ownerId}:${avatarId}` });
}

export async function getFreshCachedLocationMetadata(ownerId: string, worldId: string, groupId?: string, maxAgeMs = 6 * 60 * 60 * 1_000): Promise<{ worldName?: string; groupName?: string }> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const updatedAfter = new Date(Date.now() - maxAgeMs);
    const [world, group] = await Promise.all([c.worlds.findOne({ _id: `${ownerId}:${worldId}`, updatedAt: { $gte: updatedAfter } }), groupId ? c.groups.findOne({ _id: `${ownerId}:${groupId}`, updatedAt: { $gte: updatedAfter } }) : null]);
    return { worldName: world?.world.name, groupName: group?.group.name };
}
