import "server-only";

import { groupGalleryIdSchema } from "@/lib/vrchat/ids";
import { type VrchatGroupCalendarEvent, type VrchatGroupCalendarInterestUpdate, type VrchatGroupGallery, type VrchatGroupGalleryImage, type VrchatGroupInstance, type VrchatGroupMember, type VrchatGroupPost, vrchatGroupGalleryImageSchema, vrchatGroupGallerySchema, vrchatGroupMemberSchema } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getCachedGroupPosts(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const snapshot = await c.groupPostSnapshots.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
    if (!snapshot) return null;
    const documents = await c.groupPosts.find({ ownerId, groupId, active: true }).sort({ "post.updatedAt": -1, "post.createdAt": -1 }).toArray();
    return documents.map((document) => document.post);
}

export async function replaceCachedGroupPosts(ownerId: string, groupId: string, posts: VrchatGroupPost[], observedAt = new Date()) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const collection = c.groupPosts;
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
    await Promise.all([
        collection.updateMany({ ownerId, groupId, active: true, ...(postIds.length ? { postId: { $nin: postIds } } : {}) }, { $set: { active: false, updatedAt: observedAt } }),
        c.groupPostSnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, { $set: { ownerId, groupId, observedAt, updatedAt: observedAt } }, { upsert: true }),
    ]);
}

export async function upsertCachedGroupPost(ownerId: string, groupId: string, post: VrchatGroupPost, observedAt = new Date()) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    await Promise.all([
        c.groupPosts.updateOne({ _id: `${ownerId}:${groupId}:${post.id}` }, { $set: { ownerId, groupId, postId: post.id, post, active: true, observedAt, updatedAt: observedAt } }, { upsert: true }),
        c.groupPostSnapshots.updateOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId }, { $set: { observedAt, updatedAt: observedAt } }),
    ]);
}

export async function deactivateCachedGroupPost(ownerId: string, groupId: string, postId: string, observedAt = new Date()) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    await Promise.all([c.groupPosts.updateOne({ _id: `${ownerId}:${groupId}:${postId}`, ownerId, groupId, postId }, { $set: { active: false, updatedAt: observedAt } }), c.groupPostSnapshots.updateOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId }, { $set: { observedAt, updatedAt: observedAt } })]);
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

export async function deactivateCachedGroupMember(ownerId: string, groupId: string, userId: string, observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groupMembers.updateOne({ _id: `${ownerId}:${groupId}:${userId}`, ownerId, groupId, userId }, { $set: { active: false, observedAt, updatedAt: observedAt } });
}

export async function getCachedGroupBans(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const bans = (await collections(await getMongoDatabase()).groupBanSnapshots.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId }))?.bans;
    return bans ? bans.map((ban) => validateGroupBan(groupId, ban)) : null;
}

export async function replaceCachedGroupBans(ownerId: string, groupId: string, bans: VrchatGroupMember[], observedAt = new Date()) {
    await ensureMongoSchema();
    const validated = bans.map((ban) => validateGroupBan(groupId, ban));
    await collections(await getMongoDatabase()).groupBanSnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, { $set: { ownerId, groupId, bans: validated, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function upsertCachedGroupBan(ownerId: string, groupId: string, ban: VrchatGroupMember, updatedAt = new Date()) {
    await ensureMongoSchema();
    const validated = validateGroupBan(groupId, ban);
    const collection = collections(await getMongoDatabase()).groupBanSnapshots;
    const existing = await collection.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
    if (!existing) return false;
    const bans = [validated, ...existing.bans.map((item) => validateGroupBan(groupId, item)).filter((item) => item.userId !== validated.userId)];
    await collection.updateOne({ _id: existing._id, ownerId, groupId }, { $set: { bans, observedAt: updatedAt, updatedAt } });
    return true;
}

function validateGroupBan(groupId: string, value: unknown) {
    const ban = vrchatGroupMemberSchema.parse(value);
    if (ban.groupId && ban.groupId !== groupId) throw new Error("The cached group ban belongs to another group.");
    return ban;
}

export type GroupInviteSnapshot = {
    invites: VrchatGroupMember[];
    joinRequests: VrchatGroupMember[];
    blockedRequests: VrchatGroupMember[];
};

export async function getCachedGroupInvites(ownerId: string, groupId: string): Promise<GroupInviteSnapshot | null> {
    await ensureMongoSchema();
    const snapshot = await collections(await getMongoDatabase()).groupInviteSnapshots.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
    if (!snapshot) return null;
    return {
        invites: snapshot.invites.map((row) => validateGroupBan(groupId, row)),
        joinRequests: snapshot.joinRequests.map((row) => validateGroupBan(groupId, row)),
        blockedRequests: snapshot.blockedRequests.map((row) => validateGroupBan(groupId, row)),
    };
}

export async function replaceCachedGroupInvites(ownerId: string, groupId: string, snapshot: GroupInviteSnapshot, observedAt = new Date()) {
    await ensureMongoSchema();
    const validated = {
        invites: snapshot.invites.map((row) => validateGroupBan(groupId, row)),
        joinRequests: snapshot.joinRequests.map((row) => validateGroupBan(groupId, row)),
        blockedRequests: snapshot.blockedRequests.map((row) => validateGroupBan(groupId, row)),
    };
    await collections(await getMongoDatabase()).groupInviteSnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, { $set: { ownerId, groupId, ...validated, observedAt, updatedAt: observedAt } }, { upsert: true });
}

export async function invalidateCachedGroupInvites(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groupInviteSnapshots.deleteOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
}

export async function projectGroupInviteAction(ownerId: string, groupId: string, userId: string, action: "accept" | "block" | "delete-blocked" | "delete-invite" | "reject", updatedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).groupInviteSnapshots;
    const snapshot = await collection.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
    if (!snapshot) return false;
    const joinRequest = snapshot.joinRequests.find((row) => row.userId === userId);
    const update =
        action === "delete-invite"
            ? { invites: snapshot.invites.filter((row) => row.userId !== userId) }
            : action === "delete-blocked"
              ? { blockedRequests: snapshot.blockedRequests.filter((row) => row.userId !== userId) }
              : action === "block"
                ? { joinRequests: snapshot.joinRequests.filter((row) => row.userId !== userId), blockedRequests: joinRequest ? [joinRequest, ...snapshot.blockedRequests.filter((row) => row.userId !== userId)] : snapshot.blockedRequests }
                : { joinRequests: snapshot.joinRequests.filter((row) => row.userId !== userId) };
    await collection.updateOne({ _id: snapshot._id, ownerId, groupId }, { $set: { ...update, observedAt: updatedAt, updatedAt } });
    return true;
}

export async function removeCachedGroupBan(ownerId: string, groupId: string, userId: string, updatedAt = new Date()) {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).groupBanSnapshots.updateOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId }, { $pull: { bans: { userId } }, $set: { observedAt: updatedAt, updatedAt } });
    return result.matchedCount > 0;
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

export async function getCachedGroupGalleries(ownerId: string, groupId: string) {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).groupGallerySnapshots.findOne({ _id: `${ownerId}:${groupId}`, ownerId, groupId });
    if (!document) return null;
    const galleries = vrchatGroupGallerySchema.array().parse(document.galleries);
    const images = vrchatGroupGalleryImageSchema.array().parse(document.images);
    const truncatedGalleryIds = groupGalleryIdSchema.array().parse(document.truncatedGalleryIds);
    const galleryIds = new Set(galleries.map((gallery) => gallery.id));
    if (images.some((image) => image.groupId !== groupId || !galleryIds.has(image.galleryId)) || truncatedGalleryIds.some((galleryId) => !galleryIds.has(galleryId))) throw new Error("The cached group gallery snapshot did not match its owner.");
    return {
        galleries,
        images,
        truncatedGalleryIds,
        observedAt: document.observedAt,
    };
}

export async function replaceCachedGroupGalleries(ownerId: string, groupId: string, galleries: VrchatGroupGallery[], images: VrchatGroupGalleryImage[], truncatedGalleryIds: string[], observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).groupGallerySnapshots.updateOne({ _id: `${ownerId}:${groupId}` }, { $set: { ownerId, groupId, galleries, images, truncatedGalleryIds, observedAt, updatedAt: observedAt } }, { upsert: true });
}
