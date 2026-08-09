import "server-only";

import type { VrchatGroupCalendarEvent, VrchatGroupCalendarInterestUpdate, VrchatGroupInstance, VrchatGroupMember, VrchatGroupPost } from "@/lib/vrchat/types";
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

export async function getCachedGroupInstances(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).groupInstanceSnapshots.findOne({ _id: `${ownerId}:${groupId}` });
    if (!document) return null;
    return { instances: document.instances, upstreamFetchedAt: document.upstreamFetchedAt, observedAt: document.observedAt };
}

export async function replaceCachedGroupInstances(ownerId: string, groupId: string, instances: VrchatGroupInstance[], upstreamFetchedAt?: string, observedAt = new Date()) {
    await ensureMongoSchema();
    const snapshot = { ownerId, groupId, instances, observedAt, updatedAt: observedAt };
    await collections(await getMongoDatabase()).groupInstanceSnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, upstreamFetchedAt ? { $set: { ...snapshot, upstreamFetchedAt } } : { $set: snapshot, $unset: { upstreamFetchedAt: "" } }, { upsert: true });
}

export async function replaceAllCachedGroupInstances(ownerId: string, groupIds: string[], instances: VrchatGroupInstance[], upstreamFetchedAt?: string, observedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groupInstanceSnapshots;
    const uniqueGroupIds = Array.from(new Set(groupIds));
    const byGroupId = Map.groupBy(instances, (instance) => instance.ownerId);
    if (uniqueGroupIds.length) {
        await collection.bulkWrite(
            uniqueGroupIds.map((groupId) => {
                const snapshot = { ownerId, groupId, instances: byGroupId.get(groupId) || [], observedAt, updatedAt: observedAt };
                return {
                    updateOne: {
                        filter: { _id: `${ownerId}:${groupId}` },
                        update: upstreamFetchedAt ? { $set: { ...snapshot, upstreamFetchedAt } } : { $set: snapshot, $unset: { upstreamFetchedAt: "" } },
                        upsert: true,
                    },
                };
            }),
            { ordered: false },
        );
    }
    await collection.deleteMany({ ownerId, ...(uniqueGroupIds.length ? { groupId: { $nin: uniqueGroupIds } } : {}) });
}

export async function getCachedGroupCalendar(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).groupCalendarSnapshots.findOne({ _id: `${ownerId}:${groupId}` });
    if (!document) return null;
    return { events: document.events, hasNext: document.hasNext, totalCount: document.totalCount, observedAt: document.observedAt };
}

export async function replaceCachedGroupCalendar(ownerId: string, groupId: string, events: VrchatGroupCalendarEvent[], hasNext: boolean, totalCount: number, observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groupCalendarSnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, { $set: { ownerId, groupId, events, hasNext, totalCount, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function updateCachedGroupCalendarEvent(ownerId: string, groupId: string, event: VrchatGroupCalendarInterestUpdate, updatedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groupCalendarSnapshots;
    const result = await collection.updateOne({ _id: `${ownerId}:${groupId}`, "events.id": event.id }, { $set: { "events.$.userInterest": event.userInterest, updatedAt } });
    if (!result.matchedCount) return false;
    return true;
}
