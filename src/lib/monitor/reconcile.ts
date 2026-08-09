import "server-only";

import { z } from "zod";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { enrichGameSession, observeGameSession } from "@/lib/game-log/session-repository";
import { isGroupInstanceFor } from "@/lib/group-instances";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections, type FriendSnapshotDocument } from "@/lib/mongodb/collections";
import { replaceGroupMemberships } from "@/lib/mongodb/entity-repository";
import { replaceAllCachedGroupInstances } from "@/lib/mongodb/group-dialog-repository";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { replaceFavoriteGroupProjection, replaceFavoriteProjection, replaceModerationProjection } from "@/lib/mongodb/projection-repository";
import { updateStoredVrchatCookies } from "@/lib/mongodb/session-repository";
import { upsertCachedUsers } from "@/lib/mongodb/user-repository";
import { type NotificationSource, replaceActiveNotifications } from "@/lib/notifications/repository";
import { requestVrchat, VrchatApiError, type VrchatCookies } from "@/lib/vrchat/client";
import {
    type VrchatFavorite,
    type VrchatFavoriteGroup,
    type VrchatGroupInstance,
    type VrchatNotification,
    type VrchatPlayerModeration,
    type VrchatUser,
    vrchatFavoriteGroupSchema,
    vrchatFavoriteSchema,
    vrchatGroupInstancesResponseSchema,
    vrchatGroupSchema,
    vrchatNotificationSchema,
    vrchatPlayerModerationSchema,
    vrchatUserSchema,
} from "@/lib/vrchat/types";
import { persistActivityTransitions } from "./activity-events";
import { acquireReconciliationLease, releaseReconciliationLease } from "./lease";
import { resolveLocationMetadata } from "./location-metadata";
import { applySelfSnapshot } from "./self-events";

import { randomUUID } from "node:crypto";

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
    const reconciliationStartedAt = new Date();
    const currentResponse = await requestVrchat<unknown>("auth/user", { cookies });
    const user = vrchatUserSchema.parse(currentResponse.data);
    const currentUserObservedAt = new Date();
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

    let groupInstances: { instances: VrchatGroupInstance[]; fetchedAt?: string; observedAt: Date } | null = null;
    try {
        const instancesResponse = await requestVrchat<unknown>(`users/${user.id}/instances/groups`, { cookies: currentCookies });
        currentCookies = { ...currentCookies, ...instancesResponse.cookies };
        const parsed = vrchatGroupInstancesResponseSchema.parse(instancesResponse.data);
        const membershipIds = new Set(memberships.map((group) => group.id));
        if (parsed.instances.some((instance) => !membershipIds.has(instance.ownerId) || !isGroupInstanceFor(instance, instance.ownerId))) {
            throw new Error("The group instances response did not match the active memberships.");
        }
        groupInstances = { instances: parsed.instances, fetchedAt: parsed.fetchedAt, observedAt: new Date() };
    } catch (error) {
        // VRCX also treats this frequently rate-limited aggregate endpoint as a
        // deferred refresh. Preserve the last complete snapshot without
        // failing unrelated friend/session reconciliation.
        if (!(error instanceof VrchatApiError) || (error.status !== 429 && error.status !== 502)) throw error;
    }

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
    const allPreviousDocuments = await c.friendSnapshots.find({ ownerId: user.id }).toArray();
    const protectedFriendIds = new Set(allPreviousDocuments.filter((document) => document.updatedAt > reconciliationStartedAt).map((document) => document.friendId));
    const previousDocuments = allPreviousDocuments.filter((document) => !protectedFriendIds.has(document.friendId));
    const previousByFriendId = new Map(previousDocuments.map((document) => [document.friendId, document]));
    const reconciledFriends = combined.filter((friend) => !protectedFriendIds.has(friend.id));
    const previous = previousDocuments.flatMap((document) => toFriendSnapshots([document.user], document.online ? new Set([document.friendId]) : new Set()));
    const current = toFriendSnapshots(reconciledFriends, onlineIds);
    const observedAt = new Date();
    await applySelfSnapshot(user.id, user, currentUserObservedAt, "reconciliation");
    await Promise.all([
        upsertCachedUsers(user.id, combined, "friends", observedAt),
        replaceGroupMemberships(user.id, memberships, observedAt),
        ...(groupInstances
            ? [
                  replaceAllCachedGroupInstances(
                      user.id,
                      memberships.map((group) => group.id),
                      groupInstances.instances,
                      groupInstances.fetchedAt,
                      groupInstances.observedAt,
                  ),
              ]
            : []),
        replaceActiveNotifications(user.id, "legacy", legacyNotifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "v2", v2Notifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "hidden", hiddenNotifications.notifications, observedAt),
        replaceFavoriteProjection(user.id, favoriteState.favorites, observedAt),
        replaceFavoriteGroupProjection(user.id, favoriteState.groups, observedAt),
        replaceModerationProjection(user.id, favoriteState.moderations, observedAt),
    ]);
    const changes = previous.length ? diffFriendSnapshots(previous, current, observedAt.toISOString()) : [];
    const snapshotOperations = reconciledFriends.map((friend) => {
        const document: FriendSnapshotDocument = {
            _id: `${user.id}:${friend.id}`,
            ownerId: user.id,
            friendId: friend.id,
            online: onlineIds.has(friend.id),
            user: friend,
            observedAt,
            updatedAt: observedAt,
        };
        const prior = previousByFriendId.get(friend.id);
        return {
            updateOne: {
                filter: prior ? { _id: document._id, updatedAt: prior.updatedAt } : { _id: document._id },
                update: prior ? { $set: document } : { $setOnInsert: document },
                upsert: !prior,
            },
        };
    });
    await persistActivityTransitions({ ownerId: user.id, events: changes, previousDocuments, observedAt, provenance: "reconciliation" });
    if (snapshotOperations.length) await c.friendSnapshots.bulkWrite(snapshotOperations, { ordered: false });

    const currentIds = new Set(reconciledFriends.map((friend) => friend.id));
    await c.friendSnapshots.deleteMany({ ownerId: user.id, updatedAt: { $lte: reconciliationStartedAt }, friendId: { $nin: [...currentIds] } });

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
