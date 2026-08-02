import "server-only";

import { getMongoDatabase } from "./client";
import { collections, type LocalFavoriteDocument, type LocalFavoriteGroupDocument, type LocalFavoriteKind } from "./collections";
import { ensureMongoSchema } from "./migrations";

import { randomUUID } from "node:crypto";

function normalizeName(name: string) {
    return name.trim().normalize("NFKC").toLocaleLowerCase("en");
}

export async function listLocalFavoriteGroups(ownerId: string, kind: LocalFavoriteKind) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const [groups, counts] = await Promise.all([c.localFavoriteGroups.find({ ownerId, kind }).sort({ createdAt: 1 }).toArray(), c.localFavorites.aggregate<{ _id: string; count: number }>([{ $match: { ownerId, kind } }, { $group: { _id: "$groupId", count: { $sum: 1 } } }]).toArray()]);
    const countByGroup = new Map(counts.map((entry) => [entry._id, entry.count]));
    return groups.map((group) => ({ ...group, count: countByGroup.get(group.groupId) || 0 }));
}

export async function listLocalFavorites(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const group = await c.localFavoriteGroups.findOne({ ownerId, groupId });
    if (!group) return null;
    const items = await c.localFavorites.find({ ownerId, groupId }).sort({ updatedAt: -1 }).toArray();
    return { group, items };
}

export async function createLocalFavoriteGroup(ownerId: string, kind: LocalFavoriteKind, name: string) {
    await ensureMongoSchema();
    const now = new Date();
    const groupId = `lfg_${randomUUID()}`;
    const document: LocalFavoriteGroupDocument = { _id: `${ownerId}:${groupId}`, ownerId, groupId, kind, name: name.trim(), normalizedName: normalizeName(name), createdAt: now, updatedAt: now };
    await collections(await getMongoDatabase()).localFavoriteGroups.insertOne(document);
    return document;
}

export async function renameLocalFavoriteGroup(ownerId: string, groupId: string, name: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).localFavoriteGroups.findOneAndUpdate({ ownerId, groupId }, { $set: { name: name.trim(), normalizedName: normalizeName(name), updatedAt: new Date() } }, { returnDocument: "after" });
}

async function cachedItem(ownerId: string, kind: LocalFavoriteKind, objectId: string) {
    const c = collections(await getMongoDatabase());
    if (kind === "friend") {
        const [friend, user] = await Promise.all([c.friendSnapshots.findOne({ ownerId, friendId: objectId }), c.users.findOne({ ownerId, userId: objectId })]);
        return friend?.user || user?.user || null;
    }
    if (kind === "world") return (await c.worlds.findOne({ ownerId, worldId: objectId }))?.world || null;
    return (await c.avatars.findOne({ ownerId, avatarId: objectId }))?.avatar || null;
}

export async function addLocalFavorite(ownerId: string, groupId: string, kind: LocalFavoriteKind, objectId: string) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const group = await c.localFavoriteGroups.findOne({ ownerId, groupId, kind });
    if (!group) return { status: "group-not-found" as const };
    const item = await cachedItem(ownerId, kind, objectId);
    if (!item) return { status: "item-not-found" as const };
    const now = new Date();
    const _id = `${ownerId}:${groupId}:${objectId}`;
    const document: LocalFavoriteDocument = { _id, ownerId, groupId, kind, objectId, item, createdAt: now, updatedAt: now };
    await c.localFavorites.updateOne({ _id }, { $set: { item, updatedAt: now }, $setOnInsert: { _id, ownerId, groupId, kind, objectId, createdAt: now } }, { upsert: true });
    return { status: "ok" as const, favorite: document };
}

export async function deleteLocalFavorite(ownerId: string, groupId: string, objectId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).localFavorites.deleteOne({ ownerId, groupId, objectId });
}

export async function deleteLocalFavoriteGroup(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const group = await c.localFavoriteGroups.findOneAndDelete({ ownerId, groupId });
    if (group) await c.localFavorites.deleteMany({ ownerId, groupId });
    return group;
}
