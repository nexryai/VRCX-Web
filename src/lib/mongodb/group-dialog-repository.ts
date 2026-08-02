import "server-only";

import type { VrchatGroupMember, VrchatGroupPost } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function listCachedGroupPosts(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .groupPosts.find({ ownerId, groupId, active: true })
        .sort({ "post.updatedAt": -1, "post.createdAt": -1 })
        .toArray();
    return documents.map((document) => document.post);
}

export async function replaceCachedGroupPosts(ownerId: string, groupId: string, posts: VrchatGroupPost[], observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groupPosts;
    if (posts.length) {
        await collection.bulkWrite(
            posts.map((post) => ({
                updateOne: {
                    filter: { _id: `${ownerId}:${groupId}:${post.id}` },
                    update: { $set: { ownerId, groupId, postId: post.id, post, active: true, observedAt, updatedAt: observedAt } },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
    }
    const postIds = posts.map((post) => post.id);
    await collection.updateMany({ ownerId, groupId, active: true, ...(postIds.length ? { postId: { $nin: postIds } } : {}) }, { $set: { active: false, updatedAt: observedAt } });
}

export async function listCachedGroupMembers(ownerId: string, groupId: string, offset: number, limit: number) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groupMembers;
    const [documents, total] = await Promise.all([collection.find({ ownerId, groupId, active: true }).sort({ "member.joinedAt": -1, userId: 1 }).skip(offset).limit(limit).toArray(), collection.countDocuments({ ownerId, groupId, active: true })]);
    return { members: documents.map((document) => document.member), total };
}

export async function upsertCachedGroupMembers(ownerId: string, groupId: string, members: VrchatGroupMember[], observedAt = new Date()) {
    if (!members.length) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groupMembers.bulkWrite(
        members.map((member) => ({
            updateOne: {
                filter: { _id: `${ownerId}:${groupId}:${member.userId}` },
                update: { $set: { ownerId, groupId, userId: member.userId, member, active: true, observedAt, updatedAt: observedAt } },
                upsert: true,
            },
        })),
        { ordered: false },
    );
}
