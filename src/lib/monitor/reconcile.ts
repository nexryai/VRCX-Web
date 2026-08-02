import "server-only";

import { z } from "zod";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { enrichGameSession, observeGameSession } from "@/lib/game-log/session-repository";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections, type FriendSnapshotDocument } from "@/lib/mongodb/collections";
import { replaceGroupMemberships } from "@/lib/mongodb/entity-repository";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { replaceFavoriteGroupProjection, replaceFavoriteProjection, replaceModerationProjection } from "@/lib/mongodb/projection-repository";
import { updateStoredVrchatCookies } from "@/lib/mongodb/session-repository";
import { upsertCachedUser, upsertCachedUsers } from "@/lib/mongodb/user-repository";
import { type NotificationSource, replaceActiveNotifications } from "@/lib/notifications/repository";
import { requestVrchat, VrchatApiError, type VrchatCookies } from "@/lib/vrchat/client";
import { type VrchatFavorite, type VrchatFavoriteGroup, type VrchatNotification, type VrchatPlayerModeration, type VrchatUser, vrchatFavoriteGroupSchema, vrchatFavoriteSchema, vrchatGroupSchema, vrchatNotificationSchema, vrchatPlayerModerationSchema, vrchatUserSchema } from "@/lib/vrchat/types";
import { acquireReconciliationLease, releaseReconciliationLease } from "./lease";
import { resolveLocationMetadata } from "./location-metadata";

import { createHash, randomUUID } from "node:crypto";

function activityId(ownerId: string, event: { type: string; userId: string; createdAt: string; previous?: string; current?: string }): string {
    return createHash("sha256")
        .update(`${ownerId}\u0000${event.type}\u0000${event.userId}\u0000${event.createdAt}\u0000${event.previous ?? ""}\u0000${event.current ?? ""}`)
        .digest("hex");
}

async function fetchAllFriends(cookies: VrchatCookies, offline: boolean): Promise<{ users: VrchatUser[]; cookies: VrchatCookies }> {
    const users: VrchatUser[] = [];
    let currentCookies = cookies;
    for (let offset = 0; offset <= 7500; offset += 100) {
        const response = await requestVrchat<unknown>("auth/user/friends", {
            cookies: currentCookies,
            query: { offline, n: 100, offset },
        });
        currentCookies = { ...currentCookies, ...response.cookies };
        const page = z.array(vrchatUserSchema).parse(response.data);
        users.push(...page);
        if (page.length < 100) break;
    }
    return { users, cookies: currentCookies };
}

async function fetchAllNotifications(cookies: VrchatCookies, source: NotificationSource): Promise<{ notifications: VrchatNotification[]; cookies: VrchatCookies }> {
    const notifications: VrchatNotification[] = [];
    let currentCookies = cookies;
    for (let offset = 0; offset < 1_000; offset += 100) {
        const response = await requestVrchat<unknown>(source === "v2" ? "notifications" : "auth/user/notifications", {
            cookies: currentCookies,
            query: {
                n: 100,
                offset,
                ...(source === "hidden" ? { type: "friendRequest", hidden: true } : {}),
            },
        });
        currentCookies = { ...currentCookies, ...response.cookies };
        const page = z
            .array(vrchatNotificationSchema)
            .parse(response.data)
            .map((notification) => ({
                ...notification,
                type: source === "hidden" ? "ignoredFriendRequest" : notification.type,
                source,
            }));
        notifications.push(...page);
        if (page.length < 100) break;
    }
    return { notifications, cookies: currentCookies };
}

async function fetchFavoriteState(cookies: VrchatCookies): Promise<{ favorites: VrchatFavorite[]; groups: VrchatFavoriteGroup[]; moderations: VrchatPlayerModeration[]; cookies: VrchatCookies }> {
    const favorites: VrchatFavorite[] = [];
    let currentCookies = cookies;
    for (let offset = 0; offset < 5_000; offset += 100) {
        const response = await requestVrchat<unknown>("favorites", { cookies: currentCookies, query: { n: 100, offset } });
        currentCookies = { ...currentCookies, ...response.cookies };
        const page = z.array(vrchatFavoriteSchema).parse(response.data);
        favorites.push(...page);
        if (page.length < 100) break;
    }

    const groups: VrchatFavoriteGroup[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
        const response = await requestVrchat<unknown>("favorite/groups", { cookies: currentCookies, query: { n: 50, offset } });
        currentCookies = { ...currentCookies, ...response.cookies };
        const page = z.array(vrchatFavoriteGroupSchema).parse(response.data);
        groups.push(...page);
        if (page.length < 50) break;
    }

    const moderationResponse = await requestVrchat<unknown>("auth/user/playermoderations", { cookies: currentCookies });
    currentCookies = { ...currentCookies, ...moderationResponse.cookies };
    return { favorites, groups, moderations: z.array(vrchatPlayerModerationSchema).parse(moderationResponse.data), cookies: currentCookies };
}

async function reconcileRemoteStateUnlocked(cookies: VrchatCookies, expectedOwnerId?: string): Promise<{ user: VrchatUser; cookies: VrchatCookies }> {
    await ensureMongoSchema();
    const currentResponse = await requestVrchat<unknown>("auth/user", { cookies });
    const user = vrchatUserSchema.parse(currentResponse.data);
    if (expectedOwnerId && user.id !== expectedOwnerId) {
        throw new VrchatApiError("The stored VRChat session no longer matches the active identity.", 401);
    }
    let currentCookies = { ...cookies, ...currentResponse.cookies };

    const location = user.location || user.travelingToLocation;
    const locationObservedAt = new Date();
    await observeGameSession({
        ownerId: user.id,
        location,
        worldName: user.world?.name,
        observedAt: locationObservedAt,
        provenance: "reconciliation",
    });
    const locationMetadata = await resolveLocationMetadata(user.id, location, currentCookies);
    currentCookies = locationMetadata.cookies;
    await enrichGameSession(user.id, location, { worldName: user.world?.name || locationMetadata.worldName, groupName: locationMetadata.groupName });

    const groupsResponse = await requestVrchat<unknown>(`users/${user.id}/groups`, { cookies: currentCookies });
    currentCookies = { ...currentCookies, ...groupsResponse.cookies };
    const memberships = z.array(vrchatGroupSchema).parse(groupsResponse.data);

    const online = await fetchAllFriends(currentCookies, false);
    currentCookies = online.cookies;
    const offline = await fetchAllFriends(currentCookies, true);
    currentCookies = offline.cookies;

    const legacyNotifications = await fetchAllNotifications(currentCookies, "legacy");
    currentCookies = legacyNotifications.cookies;
    const v2Notifications = await fetchAllNotifications(currentCookies, "v2");
    currentCookies = v2Notifications.cookies;
    const hiddenNotifications = await fetchAllNotifications(currentCookies, "hidden");
    currentCookies = hiddenNotifications.cookies;
    const favoriteState = await fetchFavoriteState(currentCookies);
    currentCookies = favoriteState.cookies;
    await updateStoredVrchatCookies(currentCookies, { activeUserId: user.id, authCookie: cookies.auth });

    const remotelyPresentIds = new Set(online.users.map((friend) => friend.id));
    const combined = [...online.users, ...offline.users.filter((friend) => !remotelyPresentIds.has(friend.id))];
    const onlineIds = new Set(online.users.filter((friend) => friend.state !== "active" && friend.state !== "offline").map((friend) => friend.id));
    const c = collections(await getMongoDatabase());
    const previousDocuments = await c.friendSnapshots.find({ ownerId: user.id }).toArray();
    const previous = previousDocuments.map((document) => ({
        id: document.friendId,
        displayName: document.user.displayName,
        online: document.online,
        status: `${document.user.status || ""}\n${document.user.statusDescription || ""}`,
        location: document.user.location || document.user.travelingToLocation || "",
        avatar: document.user.currentAvatarThumbnailImageUrl || document.user.currentAvatarImageUrl || "",
        bio: document.user.bio || "",
    }));
    const current = toFriendSnapshots(combined, onlineIds);
    const observedAt = new Date();
    await Promise.all([
        upsertCachedUser(user.id, user, "auth", observedAt),
        upsertCachedUsers(user.id, combined, "friends", observedAt),
        replaceGroupMemberships(user.id, memberships, observedAt),
        replaceActiveNotifications(user.id, "legacy", legacyNotifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "v2", v2Notifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "hidden", hiddenNotifications.notifications, observedAt),
        replaceFavoriteProjection(user.id, favoriteState.favorites, observedAt),
        replaceFavoriteGroupProjection(user.id, favoriteState.groups, observedAt),
        replaceModerationProjection(user.id, favoriteState.moderations, observedAt),
    ]);
    const changes = previous.length ? diffFriendSnapshots(previous, current, observedAt.toISOString()) : [];
    const snapshotOperations = combined.map((friend) => {
        const document: FriendSnapshotDocument = {
            _id: `${user.id}:${friend.id}`,
            ownerId: user.id,
            friendId: friend.id,
            online: onlineIds.has(friend.id),
            user: friend,
            observedAt,
            updatedAt: observedAt,
        };
        return {
            updateOne: {
                filter: { _id: document._id },
                update: { $set: document },
                upsert: true,
            },
        };
    });
    if (snapshotOperations.length) await c.friendSnapshots.bulkWrite(snapshotOperations, { ordered: false });

    const currentIds = new Set(combined.map((friend) => friend.id));
    await c.friendSnapshots.deleteMany({ ownerId: user.id, friendId: { $nin: [...currentIds] } });
    if (changes.length) {
        const activityOperations = changes.map((event) => {
            const document: ActivityEventDocument = {
                _id: activityId(user.id, event),
                ownerId: user.id,
                type: event.type,
                subjectUserId: event.userId,
                displayName: event.displayName,
                ...(event.previous !== undefined ? { previous: event.previous } : {}),
                ...(event.current !== undefined ? { current: event.current } : {}),
                occurredAt: new Date(event.createdAt),
                observedAt,
                provenance: "reconciliation",
            };
            return { updateOne: { filter: { _id: document._id }, update: { $setOnInsert: document }, upsert: true } };
        });
        await c.activityEvents.bulkWrite(activityOperations, { ordered: false });
    }

    return { user, cookies: currentCookies };
}

export async function reconcileRemoteState(cookies: VrchatCookies, runnerId = `reconcile:${process.pid}:${randomUUID()}`, expectedOwnerId?: string): Promise<{ user: VrchatUser; cookies: VrchatCookies } | null> {
    if (!(await acquireReconciliationLease(runnerId))) return null;
    try {
        return await reconcileRemoteStateUnlocked(cookies, expectedOwnerId);
    } finally {
        await releaseReconciliationLease(runnerId);
    }
}
