import "server-only";

import { getMongoDatabase } from "./client";
import { type AvatarTagDocument, collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

import { createHash } from "node:crypto";

export type AvatarTag = { tag: string; color: string | null };

function normalizeTag(tag: string) {
    return tag.trim().toLocaleLowerCase();
}

function documentId(ownerId: string, avatarId: string, normalizedTag: string) {
    return `${ownerId}:${avatarId}:${createHash("sha256").update(normalizedTag).digest("hex")}`;
}

export async function listAvatarTags(ownerId: string) {
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .avatarTags.find({ ownerId })
        .sort({ normalizedTag: 1 })
        .toArray();
    return documents.reduce<Record<string, AvatarTag[]>>((result, document) => {
        if (!result[document.avatarId]) result[document.avatarId] = [];
        result[document.avatarId].push({ tag: document.tag, color: document.color });
        return result;
    }, {});
}

export async function replaceAvatarTags(ownerId: string, avatarId: string, tags: AvatarTag[]) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).avatarTags;
    const now = new Date();
    const normalized = tags.map((entry) => ({ tag: entry.tag.trim(), normalizedTag: normalizeTag(entry.tag), color: entry.color }));
    const retained = normalized.map((entry) => entry.normalizedTag);
    if (normalized.length) {
        await collection.bulkWrite(
            normalized.map((entry) => {
                const _id = documentId(ownerId, avatarId, entry.normalizedTag);
                const document: Omit<AvatarTagDocument, "_id" | "createdAt"> = { ownerId, avatarId, tag: entry.tag, normalizedTag: entry.normalizedTag, color: entry.color, updatedAt: now };
                return { updateOne: { filter: { _id }, update: { $set: document, $setOnInsert: { createdAt: now } }, upsert: true } };
            }),
            { ordered: false },
        );
    }
    await collection.deleteMany({ ownerId, avatarId, ...(retained.length ? { normalizedTag: { $nin: retained } } : {}) });
    return normalized.map(({ tag, color }) => ({ tag, color }));
}
