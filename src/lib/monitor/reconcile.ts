import "server-only";

import { z } from "zod";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { observeGameSession } from "@/lib/game-log/session-repository";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections, type FriendSnapshotDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { updateStoredVrchatCookies } from "@/lib/mongodb/session-repository";
import { upsertCachedUser, upsertCachedUsers } from "@/lib/mongodb/user-repository";
import { type NotificationSource, replaceActiveNotifications } from "@/lib/notifications/repository";
import { requestVrchat, type VrchatCookies } from "@/lib/vrchat/client";
import { type VrchatNotification, type VrchatUser, vrchatNotificationSchema, vrchatUserSchema } from "@/lib/vrchat/types";

import { createHash } from "node:crypto";

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

export async function reconcileRemoteState(cookies: VrchatCookies): Promise<{ user: VrchatUser; cookies: VrchatCookies }> {
    await ensureMongoSchema();
    const currentResponse = await requestVrchat<unknown>("auth/user", { cookies });
    const user = vrchatUserSchema.parse(currentResponse.data);
    let currentCookies = { ...cookies, ...currentResponse.cookies };

    await observeGameSession({
        ownerId: user.id,
        location: user.location || user.travelingToLocation,
        worldName: user.world?.name,
        observedAt: new Date(),
        provenance: "reconciliation",
    });

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
    await updateStoredVrchatCookies(currentCookies);

    const onlineIds = new Set(online.users.map((friend) => friend.id));
    const combined = [...online.users, ...offline.users.filter((friend) => !onlineIds.has(friend.id))];
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
        replaceActiveNotifications(user.id, "legacy", legacyNotifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "v2", v2Notifications.notifications, observedAt),
        replaceActiveNotifications(user.id, "hidden", hiddenNotifications.notifications, observedAt),
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
