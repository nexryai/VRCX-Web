import "server-only";

import type { VrchatFavorite, VrchatFavoriteGroup, VrchatPlayerModeration } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function replaceFavoriteProjection(ownerId: string, favorites: VrchatFavorite[], observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).favorites;
    const recordIds = favorites.map((favorite) => favorite.id);
    if (favorites.length) {
        await collection.bulkWrite(
            favorites.map((favorite) => ({
                updateOne: {
                    filter: { _id: `${ownerId}:${favorite.id}` },
                    update: { $set: { ownerId, recordId: favorite.id, objectId: favorite.favoriteId, favoriteType: favorite.type, favorite, active: true, observedAt, updatedAt: observedAt } },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
    }
    await collection.updateMany({ ownerId, active: true, ...(recordIds.length ? { recordId: { $nin: recordIds } } : {}) }, { $set: { active: false, updatedAt: observedAt } });
}

export async function upsertFavoriteProjection(ownerId: string, favorite: VrchatFavorite, observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).favorites.updateOne({ _id: `${ownerId}:${favorite.id}` }, { $set: { ownerId, recordId: favorite.id, objectId: favorite.favoriteId, favoriteType: favorite.type, favorite, active: true, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function replaceFavoriteGroupProjection(ownerId: string, groups: VrchatFavoriteGroup[], observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).favoriteGroups;
    const groupIds = groups.map((group) => group.id);
    if (groups.length) {
        await collection.bulkWrite(
            groups.map((group) => ({ updateOne: { filter: { _id: `${ownerId}:${group.id}` }, update: { $set: { ownerId, groupId: group.id, group, active: true, observedAt, updatedAt: observedAt } }, upsert: true } })),
            { ordered: false },
        );
    }
    await collection.updateMany({ ownerId, active: true, ...(groupIds.length ? { groupId: { $nin: groupIds } } : {}) }, { $set: { active: false, updatedAt: observedAt } });
}

export async function replaceModerationProjection(ownerId: string, moderations: VrchatPlayerModeration[], observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).moderations;
    const keys = new Set(moderations.map((moderation) => `${moderation.targetUserId}:${moderation.type}`));
    if (moderations.length) {
        await collection.bulkWrite(
            moderations.map((moderation) => ({
                updateOne: {
                    filter: { _id: `${ownerId}:${moderation.targetUserId}:${moderation.type}` },
                    update: { $set: { ownerId, targetUserId: moderation.targetUserId, moderationType: moderation.type, moderation, active: true, observedAt, updatedAt: observedAt } },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
    }
    const active = await collection.find({ ownerId, active: true }, { projection: { _id: 1, targetUserId: 1, moderationType: 1 } }).toArray();
    const staleIds = active.filter((document) => !keys.has(`${document.targetUserId}:${document.moderationType}`)).map((document) => document._id);
    if (staleIds.length) await collection.updateMany({ _id: { $in: staleIds } }, { $set: { active: false, updatedAt: observedAt } });
}

export async function deactivateFavorite(ownerId: string, objectId: string) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).favorites.updateMany({ ownerId, objectId, active: true }, { $set: { active: false, updatedAt: new Date() } });
}

export async function deactivateModeration(ownerId: string, targetUserId: string, moderationType: string) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).moderations.updateMany({ ownerId, targetUserId, moderationType, active: true }, { $set: { active: false, updatedAt: new Date() } });
}
