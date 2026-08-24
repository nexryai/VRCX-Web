import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { FriendActivity } from "@/lib/activity-log";
import type { FriendSnapshotDocument } from "./collections";

let server: MongoMemoryServer;

beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri();
    process.env.MONGODB_DATABASE = "vrcx_integration";
    process.env.VRCHAT_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterAll(async () => {
    const { getMongoClient } = await import("./client");
    await (await getMongoClient()).close();
    await server.stop();
});

describe("MongoDB application repositories", () => {
    test("runs versioned migrations idempotently and creates required indexes", async () => {
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const { ensureMongoSchema } = await import("./migrations");
        await ensureMongoSchema();
        await ensureMongoSchema();

        const database = await getMongoDatabase();
        const databaseCollections = collections(database);
        const migrations = await databaseCollections.schemaMigrations.find().sort({ _id: 1 }).toArray();
        expect(migrations.map((migration) => migration._id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]);
        expect(await databaseCollections.appSettings.findOne({ _id: "singleton" })).toMatchObject({
            notificationFilters: [],
            notificationTablePageSize: 20,
            myAvatarsCardScale: 0.6,
            myAvatarsCardSpacing: 1,
            myAvatarsTablePageSize: 20,
            favoriteSortByDate: false,
            localFavoriteFriendsGroups: [],
            recentActionCooldownEnabled: false,
            recentActionCooldownMinutes: 60,
            browserNotificationsEnabled: false,
            notificationLayout: "notification-center",
            notificationDeliveryFilters: expect.objectContaining({ Online: "VIP", invite: "Friends", "group.joinRequest": "Off" }),
            toolsCollapsedCategories: [],
            favoriteCardScale: { avatar: 1, friend: 1, world: 1 },
            favoriteCardSpacing: { avatar: 1, friend: 1, world: 1 },
            moderationFilters: [],
            moderationTablePageSize: 20,
            mutualGraphLayoutIterations: 800,
            mutualGraphLayoutSpacing: 60,
            mutualGraphEdgeCurvature: 0.1,
            mutualGraphCommunitySeparation: 0,
            mutualGraphExcludedFriendIds: [],
            legacyBrowserSettingsImportVersion: 0,
        });
        const sessionIndexes = await database.collection("game_sessions").indexExists(["owner_started", "one_open_session_per_owner", "owner_world_started", "owner_group_started"]);
        expect(sessionIndexes).toBe(true);
        expect(await database.collection("group_posts").indexExists("owner_group_post_unique")).toBe(true);
        expect(await database.collection("group_post_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("personal_file_snapshots").indexExists(["owner_tag_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_members").indexExists("owner_group_user_unique")).toBe(true);
        expect(await database.collection("group_ban_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_invite_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_audit_log_snapshots").indexExists(["owner_group_filter_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("avatar_moderations").indexExists(["owner_target_type_unique", "owner_active_updated"])).toBe(true);
        expect(await database.collection("avatar_gallery_snapshots").indexExists(["owner_avatar_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("avatar_style_snapshots").indexExists(["owner_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_instance_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_calendar_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("group_gallery_snapshots").indexExists(["owner_group_unique", "owner_observed"])).toBe(true);
        expect(await database.collection("entity_memos").indexExists("owner_type_entity_unique")).toBe(true);
        expect(await database.collection("note_export_jobs").indexExists(["owner_unique", "status_heartbeat"])).toBe(true);
        expect(await database.collection("activity_events").indexExists("owner_type_occurred")).toBe(true);
        expect(await database.collection("activity_events").indexExists("owner_browser_delivery")).toBe(true);
        expect(await database.collection("self_snapshots").indexExists("owner_unique")).toBe(true);
        expect(await database.collection("recent_actions").indexExists(["owner_user_action_unique", "expires_at_ttl"])).toBe(true);
        expect(await database.collection("notifications").indexExists("owner_browser_delivery")).toBe(true);
        expect(await database.collection("notifications").indexExists("owner_source_first_observed")).toBe(true);
        expect(await databaseCollections.monitorState.findOne({ _id: "singleton" })).toMatchObject({ pipelineSequence: 0 });
        expect(await databaseCollections.appSettings.findOne({ _id: "singleton" })).toMatchObject({ avatarAutoCleanupDays: 0 });
    });

    test("imports the former root browser settings into MongoDB exactly once", async () => {
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const { getLegacyBrowserSettingsImportStatus, importLegacyBrowserSettings } = await import("./legacy-browser-settings-repository");
        const appSettings = collections(await getMongoDatabase()).appSettings;
        await appSettings.updateOne(
            { _id: "singleton" },
            {
                $set: { theme: "dark", navigationCollapsed: false, myAvatarsView: "grid", legacyBrowserSettingsImportVersion: 0 },
                $unset: { legacyBrowserSettingsImportedAt: "", legacyBrowserSettingsImportedKeys: "" },
            },
        );

        const importedAt = new Date("2026-08-09T08:00:00.000Z");
        expect(await importLegacyBrowserSettings({ theme: "light", navigationCollapsed: true, myAvatarsView: "table" }, importedAt)).toBe(true);
        expect(await getLegacyBrowserSettingsImportStatus()).toEqual({
            version: 1,
            completed: true,
            importedAt,
            importedKeys: ["vrcx-theme", "vrcx-nav-collapsed", "vrcx-my-avatars-view"],
        });
        expect(await appSettings.findOne({ _id: "singleton" })).toMatchObject({ theme: "light", navigationCollapsed: true, myAvatarsView: "table" });

        expect(await importLegacyBrowserSettings({ theme: "dark", navigationCollapsed: false, myAvatarsView: "grid" }, new Date("2026-08-09T09:00:00.000Z"))).toBe(false);
        expect(await appSettings.findOne({ _id: "singleton" })).toMatchObject({ theme: "light", navigationCollapsed: true, myAvatarsView: "table", legacyBrowserSettingsImportedAt: importedAt });
    });

    test("stores encrypted session material and isolates cached users by owner", async () => {
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const { saveAuthenticatedVrchatSession, getStoredVrchatSession } = await import("./session-repository");
        const { upsertCachedUser, getCachedUser } = await import("./user-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000002";
        const user = { id: ownerId, displayName: "Mongo User" };

        await saveAuthenticatedVrchatSession({ auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" }, ownerId);
        await upsertCachedUser(ownerId, user, "auth", new Date("2026-08-02T08:00:00.000Z"));
        await upsertCachedUser(ownerId, { ...user, displayName: "Fresh Mongo User" }, "friends", new Date("2026-08-02T08:10:00.000Z"));
        await upsertCachedUser(ownerId, { ...user, displayName: "Stale Mongo User" }, "friends", new Date("2026-08-02T08:05:00.000Z"));

        const storedSession = await collections(await getMongoDatabase()).vrchatSession.findOne({ _id: "singleton" });
        expect(storedSession?.encryptedCookies).toMatchObject({ algorithm: "aes-256-gcm" });
        expect(JSON.stringify(storedSession)).not.toContain("auth-cookie");
        expect(JSON.stringify(storedSession)).not.toContain("two-factor-cookie");
        expect(await getStoredVrchatSession()).toMatchObject({ status: "authenticated", activeUserId: ownerId, cookies: { auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" } });
        expect(await getCachedUser(ownerId, ownerId)).toMatchObject({ ...user, displayName: "Fresh Mongo User" });
        expect(await getCachedUser(otherOwnerId, ownerId)).toBeNull();
    });

    test("patches relationship and note fields in both user projections", async () => {
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const { getCachedUser, patchCachedUser, upsertCachedUser } = await import("./user-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000071";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000072";
        const userId = "usr_00000000-0000-0000-0000-000000000073";
        const user = { id: userId, displayName: "Relationship User", friendRequestStatus: "outgoing" };
        await upsertCachedUser(ownerId, user, "lookup");
        await upsertCachedUser(otherOwnerId, user, "lookup");
        await collections(await getMongoDatabase()).friendSnapshots.insertOne({
            _id: `${ownerId}:${userId}`,
            ownerId,
            friendId: userId,
            online: false,
            user,
            observedAt: new Date("2026-08-02T09:00:00.000Z"),
            updatedAt: new Date("2026-08-02T09:00:00.000Z"),
        });

        const updatedAt = new Date("2026-08-02T09:30:00.000Z");
        await patchCachedUser(ownerId, userId, { friendRequestStatus: "", isFriend: true, note: "Met at an event" }, updatedAt);

        expect(await getCachedUser(ownerId, userId)).toMatchObject({ friendRequestStatus: "", isFriend: true, note: "Met at an event" });
        const otherOwnerUser = await getCachedUser(otherOwnerId, userId);
        expect(otherOwnerUser).toMatchObject({ friendRequestStatus: "outgoing" });
        expect(otherOwnerUser?.isFriend).toBeUndefined();
        expect(otherOwnerUser?.note).toBeUndefined();
        expect(await (await getMongoDatabase()).collection("friend_snapshots").findOne({ ownerId, friendId: userId })).toMatchObject({ user: { friendRequestStatus: "", isFriend: true, note: "Met at an event" }, updatedAt });
    });

    test("rejects stale cookie rotation after an active-account replacement", async () => {
        const { clearStoredVrchatSession, getStoredVrchatSession, saveAuthenticatedVrchatSession, updateStoredVrchatCookies } = await import("./session-repository");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const firstOwnerId = "usr_00000000-0000-0000-0000-000000000010";
        const secondOwnerId = "usr_00000000-0000-0000-0000-000000000011";
        await saveAuthenticatedVrchatSession({ auth: "first-auth" }, firstOwnerId);
        await collections(await getMongoDatabase()).monitorState.updateOne(
            { _id: "singleton" },
            { $set: { ownerId: firstOwnerId, pipelineSequence: 7, lastPipelineEventKey: "first-event", lastPipelineEventType: "friend-online", lastPipelineEventAt: new Date(), lastAvatarCleanupAt: new Date(), lastAvatarAutoCleanupAt: new Date(), lastAvatarCleanupDeleted: 4 } },
        );
        const jobNow = new Date();
        await collections(await getMongoDatabase()).noteExportJobs.updateOne(
            { _id: firstOwnerId },
            { $set: { ownerId: firstOwnerId, jobId: "old-account-job", executionId: "old-account-execution", status: "running", items: [], processed: 0, total: 0, cancelRequested: false, heartbeatAt: jobNow, createdAt: jobNow, updatedAt: jobNow } },
            { upsert: true },
        );
        await saveAuthenticatedVrchatSession({ auth: "second-auth" }, secondOwnerId);

        expect(await updateStoredVrchatCookies({ twoFactorAuth: "stale-cookie" }, { activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await clearStoredVrchatSession({ activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await getStoredVrchatSession()).toMatchObject({ activeUserId: secondOwnerId, cookies: { auth: "second-auth" } });
        expect((await getStoredVrchatSession())?.cookies.twoFactorAuth).toBeUndefined();
        expect(await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" })).toMatchObject({ ownerId: secondOwnerId, pipelineSequence: 0, status: "starting", pipelineConnected: false });
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastPipelineEventKey).toBeUndefined();
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastAvatarCleanupAt).toBeUndefined();
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastAvatarAutoCleanupAt).toBeUndefined();
        expect(await collections(await getMongoDatabase()).noteExportJobs.findOne({ _id: firstOwnerId })).toMatchObject({ status: "cancelled", cancelRequested: true });
        expect((await collections(await getMongoDatabase()).noteExportJobs.findOne({ _id: firstOwnerId }))?.executionId).toBeUndefined();
    });

    test("serializes reconciliation across server processes", async () => {
        const { acquireReconciliationLease, releaseReconciliationLease } = await import("@/lib/monitor/lease");
        const now = new Date("2026-08-02T10:00:00.000Z");
        expect(await acquireReconciliationLease("worker-a", now)).toBe(true);
        expect(await acquireReconciliationLease("worker-b", now)).toBe(false);
        await releaseReconciliationLease("worker-a");
        expect(await acquireReconciliationLease("worker-b", now)).toBe(true);
        await releaseReconciliationLease("worker-b");
    });

    test("allows monitor leadership only after the previous lease expires", async () => {
        const { acquireMonitorLease, advanceMonitorPipelineCursor, prepareMonitorIdentity, updateMonitorHealth } = await import("@/lib/monitor/lease");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const firstTick = new Date();
        expect(await acquireMonitorLease("monitor-a", firstTick)).toBe(true);
        expect(await acquireMonitorLease("monitor-b", firstTick)).toBe(false);
        const monitorState = collections(await getMongoDatabase()).monitorState;
        await monitorState.updateOne({ _id: "singleton" }, { $set: { ownerId: "usr_previous", pipelineSequence: 9, lastPipelineEventKey: "previous-event" } });
        await prepareMonitorIdentity("monitor-a", "usr_00000000-0000-0000-0000-000000000001");
        expect(await monitorState.findOne({ _id: "singleton" })).toMatchObject({ ownerId: "usr_00000000-0000-0000-0000-000000000001", pipelineSequence: 0 });
        expect((await monitorState.findOne({ _id: "singleton" }))?.lastPipelineEventKey).toBeUndefined();
        await updateMonitorHealth("monitor-a", { ownerId: "usr_00000000-0000-0000-0000-000000000001" });
        expect(await advanceMonitorPipelineCursor("monitor-a", { ownerId: "usr_00000000-0000-0000-0000-000000000001", key: "event-key", type: "friend-online", observedAt: new Date(firstTick.getTime() + 1_000) })).toBe(true);
        expect(await monitorState.findOne({ _id: "singleton" })).toMatchObject({ pipelineSequence: 1, lastPipelineEventKey: "event-key", lastPipelineEventType: "friend-online" });
        expect(await acquireMonitorLease("monitor-b", new Date(firstTick.getTime() + 60_001))).toBe(true);
        expect(await acquireMonitorLease("monitor-a", new Date(firstTick.getTime() + 60_002))).toBe(false);
        expect(await advanceMonitorPipelineCursor("monitor-a", { ownerId: "usr_00000000-0000-0000-0000-000000000001", key: "stale-key", type: "friend-offline", observedAt: new Date(firstTick.getTime() + 63_000) })).toBe(false);
    });

    test("claims only a stale owner-scoped Mutual Friends checkpoint", async () => {
        const { claimStaleMutualGraphJob } = await import("@/lib/mutual-graph-job");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const ownerId = "usr_00000000-0000-0000-0000-000000000091";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000092";
        const firstFriendId = "usr_00000000-0000-0000-0000-000000000093";
        const secondFriendId = "usr_00000000-0000-0000-0000-000000000094";
        const now = new Date("2026-08-09T20:00:00.000Z");
        const mutualGraph = collections(await getMongoDatabase()).mutualGraph;
        await mutualGraph.insertMany([
            {
                _id: ownerId,
                ownerId,
                relationships: { published: ["snapshot"] },
                optedOut: [],
                jobId: "abandoned-job",
                jobStatus: "running",
                jobProcessed: 1,
                jobTotal: 2,
                jobCancelRequested: false,
                jobHeartbeatAt: new Date(now.getTime() - 180_000),
                jobFriendIds: [firstFriendId, secondFriendId],
                jobRelationships: { [firstFriendId]: [secondFriendId] },
                jobOptedOut: [],
                updatedAt: new Date(now.getTime() - 600_000),
            },
            {
                _id: otherOwnerId,
                ownerId: otherOwnerId,
                relationships: {},
                optedOut: [],
                jobId: "fresh-job",
                jobStatus: "running",
                jobProcessed: 0,
                jobTotal: 1,
                jobCancelRequested: false,
                jobHeartbeatAt: new Date(now.getTime() - 30_000),
                jobFriendIds: [firstFriendId],
                jobRelationships: {},
                jobOptedOut: [],
                updatedAt: now,
            },
        ]);

        const claimed = await claimStaleMutualGraphJob(ownerId, now);
        expect(claimed?.jobId).toEqual(expect.any(String));
        expect(claimed?.jobId).not.toBe("abandoned-job");
        expect(await claimStaleMutualGraphJob(ownerId, now)).toBeNull();
        expect(await claimStaleMutualGraphJob(otherOwnerId, now)).toBeNull();
        expect(await mutualGraph.findOne({ ownerId })).toMatchObject({
            relationships: { published: ["snapshot"] },
            jobProcessed: 1,
            jobFriendIds: [firstFriendId, secondFriendId],
            jobRelationships: { [firstFriendId]: [secondFriendId] },
            jobHeartbeatAt: now,
        });
    });

    test("keeps notification history while updating the active projection", async () => {
        const { replaceActiveNotifications, listActiveNotifications, listNotificationCenterNotifications } = await import("@/lib/notifications/repository");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const first = new Date("2026-08-02T10:00:00.000Z");
        const second = new Date("2026-08-02T10:05:00.000Z");

        await replaceActiveNotifications(ownerId, "legacy", [{ id: "not_first", type: "invite", message: "First" }], first);
        await replaceActiveNotifications(ownerId, "legacy", [{ id: "not_second", type: "invite", message: "Second" }], second);

        expect((await listActiveNotifications(ownerId, "legacy", 0)).map((notification) => notification.id)).toEqual(["not_second"]);
        const retained = await (await getMongoDatabase()).collection("notifications").find({ ownerId }).toArray();
        expect(retained).toHaveLength(2);
        expect(retained.find((document) => document.notificationId === "not_first")?.active).toBe(false);
        expect((await listNotificationCenterNotifications(ownerId, "legacy", 0, second)).map((notification) => notification.id)).toEqual(["not_second", "not_first"]);

        await collections(await getMongoDatabase()).notifications.updateOne({ ownerId, notificationId: "not_second", source: "legacy" }, { $set: { seenAt: second, "notification.seen": true } });
        await replaceActiveNotifications(ownerId, "legacy", [{ id: "not_second", type: "invite", message: "Second reconciled" }], new Date(second.getTime() + 60_000));
        expect(await listActiveNotifications(ownerId, "legacy", 0)).toEqual([expect.objectContaining({ id: "not_second", seen: true, message: "Second reconciled" })]);
    });

    test("claims browser notifications once after activation and only for the active owner", async () => {
        const { claimBrowserNotifications } = await import("./browser-notifications-repository");
        const { collections } = await import("./collections");
        const { getMongoDatabase } = await import("./client");
        const { defaultNotificationDeliveryFilters } = await import("@/lib/notification-delivery-filters");
        const ownerId = "usr_00000000-0000-0000-0000-000000000181";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000182";
        const enabledAt = new Date("2026-08-23T12:00:00.000Z");
        const observedBefore = new Date(enabledAt.getTime() - 1_000);
        const observedAfter = new Date(enabledAt.getTime() + 1_000);
        const c = collections(await getMongoDatabase());
        await c.appSettings.updateOne({ _id: "singleton" }, { $set: { activeUserId: ownerId, browserNotificationsEnabled: true, browserNotificationsEnabledAt: enabledAt, notificationDeliveryFilters: { ...defaultNotificationDeliveryFilters, Online: "Friends", GPS: "Off" } } });
        const friendId = "usr_00000000-0000-0000-0000-000000000183";
        await c.friendSnapshots.insertOne({ _id: `${ownerId}:${friendId}`, ownerId, friendId, online: true, user: { id: friendId, displayName: "Remote Friend" }, observedAt: observedAfter, updatedAt: observedAfter });
        await c.activityEvents.insertMany([
            { _id: "a".repeat(64), ownerId, type: "Online", subjectUserId: friendId, displayName: "Remote Friend", current: "wrld_remote:1", occurredAt: observedAfter, observedAt: observedAfter, provenance: "pipeline" },
            { _id: "b".repeat(64), ownerId, type: "GPS", subjectUserId: friendId, displayName: "Remote Friend", current: "wrld_filtered:2", occurredAt: observedAfter, observedAt: observedAfter, provenance: "pipeline" },
        ]);
        await c.notifications.insertMany([
            { _id: `${ownerId}:legacy:not_before`, ownerId, notificationId: "not_before", source: "legacy", notification: { id: "not_before", type: "invite" }, active: true, firstObservedAt: observedBefore, lastObservedAt: observedBefore, updatedAt: observedBefore },
            { _id: `${ownerId}:legacy:not_legacy`, ownerId, notificationId: "not_legacy", source: "legacy", notification: { id: "not_legacy", type: "friendRequest" }, active: true, firstObservedAt: observedAfter, lastObservedAt: observedAfter, updatedAt: observedAfter },
            { _id: `${ownerId}:v2:not_v2`, ownerId, notificationId: "not_v2", source: "v2", notification: { id: "not_v2", type: "group.announcement" }, active: true, firstObservedAt: observedAfter, lastObservedAt: observedAfter, updatedAt: observedAfter },
            { _id: `${ownerId}:hidden:not_hidden`, ownerId, notificationId: "not_hidden", source: "hidden", notification: { id: "not_hidden", type: "invite" }, active: true, firstObservedAt: observedAfter, lastObservedAt: observedAfter, updatedAt: observedAfter },
            { _id: `${otherOwnerId}:legacy:not_other`, ownerId: otherOwnerId, notificationId: "not_other", source: "legacy", notification: { id: "not_other", type: "invite" }, active: true, firstObservedAt: observedAfter, lastObservedAt: observedAfter, updatedAt: observedAfter },
        ]);

        const deliveredAt = new Date("2026-08-23T12:05:00.000Z");
        const claims = (await Promise.all([claimBrowserNotifications(ownerId, deliveredAt, 1), claimBrowserNotifications(ownerId, deliveredAt, 10)])).flat();
        expect(claims.map((notification) => notification.id).sort()).toEqual(["a".repeat(64), "not_legacy", "not_v2"]);
        expect(new Set(claims.map((notification) => notification.id)).size).toBe(3);
        expect(await claimBrowserNotifications(ownerId, deliveredAt, 10)).toEqual([]);
        expect(await claimBrowserNotifications(otherOwnerId, deliveredAt, 10)).toEqual([]);
        expect((await c.notifications.findOne({ _id: `${ownerId}:legacy:not_legacy` }))?.browserDeliveredAt).toEqual(deliveredAt);
        expect((await c.notifications.findOne({ _id: `${ownerId}:legacy:not_before` }))?.browserDeliveredAt).toBeUndefined();
        expect((await c.notifications.findOne({ _id: `${ownerId}:hidden:not_hidden` }))?.browserDeliveredAt).toBeUndefined();
        expect((await c.activityEvents.findOne({ _id: "a".repeat(64) }))?.browserDeliveredAt).toEqual(deliveredAt);
        expect((await c.activityEvents.findOne({ _id: "b".repeat(64) }))?.browserDeliveredAt).toEqual(deliveredAt);

        await c.appSettings.updateOne({ _id: "singleton" }, { $set: { browserNotificationsEnabled: false } });
        expect(await claimBrowserNotifications(ownerId, deliveredAt, 10)).toEqual([]);
    });

    test("keeps VRCX-local favorite groups owner scoped in MongoDB", async () => {
        const { addLocalFavorite, createLocalFavoriteGroup, listLocalFavoriteGroups, listLocalFavorites, renameLocalFavoriteGroup } = await import("./local-favorites-repository");
        const { upsertCachedWorlds } = await import("./entity-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000041";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000042";
        const world = { id: "wrld_00000000-0000-0000-0000-000000000043", name: "Local Favorite World" };
        await upsertCachedWorlds(ownerId, [world], "lookup");
        const group = await createLocalFavoriteGroup(ownerId, "world", "Weekend");
        expect((await addLocalFavorite(ownerId, group.groupId, "world", world.id)).status).toBe("ok");
        expect(await addLocalFavorite(otherOwnerId, group.groupId, "world", world.id)).toEqual({ status: "group-not-found" });
        expect(await renameLocalFavoriteGroup(ownerId, group.groupId, "Weekends")).toMatchObject({ name: "Weekends", normalizedName: "weekends" });
        expect(await listLocalFavoriteGroups(ownerId, "world")).toEqual([expect.objectContaining({ groupId: group.groupId, count: 1 })]);
        expect(await listLocalFavorites(ownerId, group.groupId)).toMatchObject({ items: [expect.objectContaining({ objectId: world.id, item: world })] });
    });

    test("projects the selected remote friend groups together with all local favorites", async () => {
        const { upsertCachedUser } = await import("./user-repository");
        const { upsertFavoriteProjection } = await import("./projection-repository");
        const { addLocalFavorite, createLocalFavoriteGroup } = await import("./local-favorites-repository");
        const { listSelectedFavoriteFriendIds } = await import("./friend-favorites-repository");
        const { collections } = await import("./collections");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000171";
        const firstId = "usr_00000000-0000-0000-0000-000000000172";
        const secondId = "usr_00000000-0000-0000-0000-000000000173";
        const localId = "usr_00000000-0000-0000-0000-000000000174";
        await upsertFavoriteProjection(ownerId, { id: "fvrt_first", favoriteId: firstId, type: "friend", tags: ["group_0"] });
        await upsertFavoriteProjection(ownerId, { id: "fvrt_second", favoriteId: secondId, type: "friend", tags: ["group_1"] });
        await upsertCachedUser(ownerId, { id: localId, displayName: "Local Friend" }, "lookup");
        const localGroup = await createLocalFavoriteGroup(ownerId, "friend", "Local Circle");
        expect((await addLocalFavorite(ownerId, localGroup.groupId, "friend", localId)).status).toBe("ok");

        const appSettings = collections(await getMongoDatabase()).appSettings;
        await appSettings.updateOne({ _id: "singleton" }, { $set: { localFavoriteFriendsGroups: ["friend:group_1"] } });
        expect(new Set(await listSelectedFavoriteFriendIds(ownerId))).toEqual(new Set([secondId, localId]));

        await appSettings.updateOne({ _id: "singleton" }, { $set: { localFavoriteFriendsGroups: [`local:${localGroup.groupId}`] } });
        expect(new Set(await listSelectedFavoriteFriendIds(ownerId))).toEqual(new Set([firstId, secondId, localId]));
        await appSettings.updateOne({ _id: "singleton" }, { $set: { localFavoriteFriendsGroups: [] } });
    });

    test("stores recent social actions per owner with bounded retention", async () => {
        const { getRecentActionAt, recordRecentAction } = await import("./recent-actions-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000181";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000182";
        const userId = "usr_00000000-0000-0000-0000-000000000183";
        const first = new Date("2026-08-23T12:00:00.000Z");
        const second = new Date("2026-08-23T12:05:00.000Z");
        await recordRecentAction(ownerId, userId, "friend-request", first);
        await recordRecentAction(otherOwnerId, userId, "friend-request", second);
        await recordRecentAction(ownerId, userId, "friend-request", second);
        expect(await getRecentActionAt(ownerId, userId, "friend-request")).toEqual(second);
        expect(await getRecentActionAt(otherOwnerId, userId, "friend-request")).toEqual(second);
        const document = await (await import("./collections")).collections(await (await import("./client")).getMongoDatabase()).recentActions.findOne({ ownerId, userId });
        expect(document?.expiresAt).toEqual(new Date(second.getTime() + 24 * 60 * 60 * 1_000));
    });

    test("removes only the active owner's deleted world projection", async () => {
        const { getCachedWorld, removeCachedWorld, upsertCachedWorlds } = await import("./entity-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000081";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000082";
        const world = { id: "wrld_00000000-0000-0000-0000-000000000083", name: "Deleted World" };
        await upsertCachedWorlds(ownerId, [world], "lookup");
        await upsertCachedWorlds(otherOwnerId, [world], "lookup");
        await removeCachedWorld(ownerId, world.id);
        expect(await getCachedWorld(ownerId, world.id)).toBeNull();
        expect(await getCachedWorld(otherOwnerId, world.id)).toEqual(world);
    });

    test("persists world persistence existence per owner and world", async () => {
        const { getWorldPersistSnapshot, setWorldPersistSnapshot } = await import("./world-persist-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000084";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000085";
        const worldId = "wrld_00000000-0000-0000-0000-000000000086";
        await setWorldPersistSnapshot(ownerId, worldId, true, new Date("2026-08-23T00:00:00.000Z"));
        await setWorldPersistSnapshot(otherOwnerId, worldId, false);
        await setWorldPersistSnapshot(ownerId, worldId, false, new Date("2026-08-23T00:05:00.000Z"));
        expect(await getWorldPersistSnapshot(ownerId, worldId)).toMatchObject({ ownerId, worldId, hasPersistData: false, observedAt: new Date("2026-08-23T00:05:00.000Z") });
        expect(await getWorldPersistSnapshot(otherOwnerId, worldId)).toMatchObject({ ownerId: otherOwnerId, hasPersistData: false });
        const indexes = await (await getMongoDatabase()).collection("world_persist_snapshots").indexes();
        expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["owner_world_unique", "owner_observed"]));
    });

    test("replaces owner-scoped avatar tags in MongoDB", async () => {
        const { listAvatarTags, replaceAvatarTags } = await import("./avatar-tags-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000045";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000046";
        const avatarId = "avtr_00000000-0000-0000-0000-000000000047";
        await replaceAvatarTags(ownerId, avatarId, [
            { tag: "Dancer", color: null },
            { tag: "Green", color: "#22c55e" },
        ]);
        await replaceAvatarTags(otherOwnerId, avatarId, [{ tag: "Private", color: null }]);
        expect(await replaceAvatarTags(ownerId, avatarId, [{ tag: "Dancer", color: "#3b82f6" }])).toEqual([{ tag: "Dancer", color: "#3b82f6" }]);
        expect(await listAvatarTags(ownerId)).toEqual({ [avatarId]: [{ tag: "Dancer", color: "#3b82f6" }] });
        expect(await listAvatarTags(otherOwnerId)).toEqual({ [avatarId]: [{ tag: "Private", color: null }] });
    });

    test("caches group posts and member pages per active owner", async () => {
        const {
            deactivateCachedGroupMember,
            deactivateCachedGroupPost,
            getCachedGroupBans,
            getCachedGroupInvites,
            getCachedGroupPosts,
            listCachedGroupMembers,
            projectGroupInviteAction,
            removeCachedGroupBan,
            replaceCachedGroupBans,
            replaceCachedGroupInvites,
            replaceCachedGroupPosts,
            upsertCachedGroupBan,
            upsertCachedGroupMembers,
            upsertCachedGroupPost,
        } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000051";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000052";
        const groupId = "grp_00000000-0000-0000-0000-000000000053";
        const userId = "usr_00000000-0000-0000-0000-000000000054";
        await replaceCachedGroupPosts(ownerId, groupId, [{ id: "gpos_00000000-0000-0000-0000-000000000061", title: "First", text: "Visible", roleIds: [], visibility: "group" }]);
        await replaceCachedGroupPosts(ownerId, groupId, [{ id: "gpos_00000000-0000-0000-0000-000000000062", title: "Second", text: "Replacement", roleIds: [], visibility: "group" }]);
        await upsertCachedGroupPost(ownerId, groupId, { id: "gpos_00000000-0000-0000-0000-000000000063", title: "Third", text: "Created", roleIds: [], visibility: "public" });
        await upsertCachedGroupMembers(ownerId, groupId, [{ id: "gmem_one", userId, roleIds: [], user: { id: userId, displayName: "Group Member" } }]);

        expect(await getCachedGroupPosts(ownerId, groupId)).toEqual([expect.objectContaining({ id: "gpos_00000000-0000-0000-0000-000000000062" }), expect.objectContaining({ id: "gpos_00000000-0000-0000-0000-000000000063" })]);
        await deactivateCachedGroupPost(ownerId, groupId, "gpos_00000000-0000-0000-0000-000000000062");
        expect(await getCachedGroupPosts(ownerId, groupId)).toEqual([expect.objectContaining({ id: "gpos_00000000-0000-0000-0000-000000000063" })]);
        const { getMongoDatabase } = await import("./client");
        expect(await (await getMongoDatabase()).collection("group_posts").findOne({ ownerId, groupId, postId: "gpos_00000000-0000-0000-0000-000000000061" })).toMatchObject({ active: false });
        expect(await getCachedGroupPosts(otherOwnerId, groupId)).toBeNull();
        await replaceCachedGroupPosts(otherOwnerId, groupId, []);
        expect(await getCachedGroupPosts(otherOwnerId, groupId)).toEqual([]);
        expect(await listCachedGroupMembers(ownerId, groupId, 0, 100)).toMatchObject({ total: 1, members: [expect.objectContaining({ userId })] });
        expect(await listCachedGroupMembers(otherOwnerId, groupId, 0, 100)).toEqual({ total: 0, members: [] });
        await upsertCachedGroupMembers(otherOwnerId, groupId, [{ id: "gmem_other", userId, roleIds: [] }]);
        await deactivateCachedGroupMember(ownerId, groupId, userId);
        expect(await listCachedGroupMembers(ownerId, groupId, 0, 100)).toEqual({ total: 0, members: [] });
        expect(await listCachedGroupMembers(otherOwnerId, groupId, 0, 100)).toMatchObject({ total: 1, members: [expect.objectContaining({ userId })] });
        const ban = { id: "gban_one", groupId, userId, roleIds: [], bannedAt: "2026-08-17T03:00:00.000Z" };
        expect(await getCachedGroupBans(ownerId, groupId)).toBeNull();
        expect(await upsertCachedGroupBan(ownerId, groupId, ban)).toBe(false);
        await expect(replaceCachedGroupBans(ownerId, groupId, [{ ...ban, groupId: "grp_00000000-0000-0000-0000-000000000099" }])).rejects.toThrow("another group");
        await replaceCachedGroupBans(ownerId, groupId, [ban]);
        await replaceCachedGroupBans(otherOwnerId, groupId, [{ ...ban, id: "gban_other" }]);
        expect(await getCachedGroupBans(ownerId, groupId)).toEqual([ban]);
        expect(await upsertCachedGroupBan(ownerId, groupId, { ...ban, managerNotes: "Reviewed" })).toBe(true);
        expect((await getCachedGroupBans(ownerId, groupId))?.[0]).toMatchObject({ managerNotes: "Reviewed" });
        expect(await removeCachedGroupBan(ownerId, groupId, userId)).toBe(true);
        expect(await getCachedGroupBans(ownerId, groupId)).toEqual([]);
        expect(await getCachedGroupBans(otherOwnerId, groupId)).toHaveLength(1);
        await replaceCachedGroupInvites(ownerId, groupId, { invites: [ban], joinRequests: [{ ...ban, id: "request" }], blockedRequests: [] });
        await replaceCachedGroupInvites(otherOwnerId, groupId, { invites: [], joinRequests: [], blockedRequests: [{ ...ban, id: "blocked" }] });
        expect(await projectGroupInviteAction(ownerId, groupId, userId, "delete-invite")).toBe(true);
        expect((await getCachedGroupInvites(ownerId, groupId))?.invites).toEqual([]);
        expect(await projectGroupInviteAction(ownerId, groupId, userId, "block")).toBe(true);
        expect(await getCachedGroupInvites(ownerId, groupId)).toMatchObject({ joinRequests: [], blockedRequests: [expect.objectContaining({ userId })] });
        expect((await getCachedGroupInvites(otherOwnerId, groupId))?.blockedRequests).toHaveLength(1);
    });

    test("stores complete personal Gallery snapshots and uploaded files per owner", async () => {
        const { getPersonalGallerySnapshot, replacePersonalGallerySnapshot, upsertPersonalGalleryFile } = await import("./personal-files-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000064";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000065";
        const galleryFile = (id: string, name: string) => ({ id, ownerId, name, extension: ".png", mimeType: "image/png", tags: ["gallery"], versions: [] });
        await replacePersonalGallerySnapshot(ownerId, []);
        expect(await getPersonalGallerySnapshot(ownerId)).toMatchObject({ ownerId, tag: "gallery", files: [] });
        expect(await upsertPersonalGalleryFile(ownerId, galleryFile("file_00000000-0000-0000-0000-000000000066", "Uploaded"))).toBe(true);
        expect(await getPersonalGallerySnapshot(ownerId)).toMatchObject({ files: [expect.objectContaining({ name: "Uploaded" })] });
        expect(await upsertPersonalGalleryFile(otherOwnerId, { ...galleryFile("file_00000000-0000-0000-0000-000000000067", "Private"), ownerId: otherOwnerId })).toBe(false);
        expect(await getPersonalGallerySnapshot(otherOwnerId)).toBeNull();
    });

    test("stores complete avatar Gallery snapshots and uploaded files per owner", async () => {
        const { getAvatarGallerySnapshot, replaceAvatarGallerySnapshot, upsertAvatarGalleryFile } = await import("./avatar-gallery-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000068";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000069";
        const authorId = "usr_00000000-0000-0000-0000-000000000070";
        const avatarId = "avtr_00000000-0000-0000-0000-000000000071";
        const galleryFile = (id: string, name: string) => ({ id, ownerId: authorId, name, extension: ".png", mimeType: "image/png", tags: ["avatargallery"], versions: [] });

        await replaceAvatarGallerySnapshot(ownerId, avatarId, authorId, []);
        await replaceAvatarGallerySnapshot(otherOwnerId, avatarId, authorId, [galleryFile("file_00000000-0000-0000-0000-000000000072", "Other owner's view")]);
        expect(await getAvatarGallerySnapshot(ownerId, avatarId)).toMatchObject({ ownerId, avatarId, authorId, files: [] });
        expect(await upsertAvatarGalleryFile(ownerId, avatarId, authorId, galleryFile("file_00000000-0000-0000-0000-000000000073", "Uploaded"))).toBe(true);
        expect(await getAvatarGallerySnapshot(ownerId, avatarId)).toMatchObject({ files: [expect.objectContaining({ name: "Uploaded" })] });
        expect(await getAvatarGallerySnapshot(otherOwnerId, avatarId)).toMatchObject({ files: [expect.objectContaining({ name: "Other owner's view" })] });
    });

    test("stores avatar style snapshots per owner", async () => {
        const { getAvatarStyleSnapshot, replaceAvatarStyleSnapshot } = await import("./avatar-style-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000074";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000075";
        const style = { id: "avst_00000000-0000-0000-0000-000000000076", styleName: "Realistic" };
        await replaceAvatarStyleSnapshot(ownerId, [style]);
        await replaceAvatarStyleSnapshot(otherOwnerId, []);
        expect(await getAvatarStyleSnapshot(ownerId)).toMatchObject({ ownerId, styles: [style] });
        expect(await getAvatarStyleSnapshot(otherOwnerId)).toMatchObject({ ownerId: otherOwnerId, styles: [] });
    });

    test("stores filtered group audit-log snapshots per owner", async () => {
        const { getCachedGroupAuditLogs, replaceCachedGroupAuditLogs } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000091";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000092";
        const groupId = "grp_00000000-0000-0000-0000-000000000093";
        const log = { id: "gaud_one", created_at: "2026-08-17T04:00:00.000Z", eventType: "group.member.ban", actorDisplayName: "Moderator", description: "Banned a member", data: { reason: "Rules" } };
        expect(await getCachedGroupAuditLogs(ownerId, groupId, "all")).toBeNull();
        await replaceCachedGroupAuditLogs(ownerId, groupId, "all", [], ["group.member.ban"], [log], false);
        await replaceCachedGroupAuditLogs(otherOwnerId, groupId, "all", [], ["group.member.remove"], [], false);
        expect(await getCachedGroupAuditLogs(ownerId, groupId, "all")).toMatchObject({ availableEventTypes: ["group.member.ban"], logs: [log], truncated: false });
        expect(await getCachedGroupAuditLogs(otherOwnerId, groupId, "all")).toMatchObject({ logs: [] });
    });

    test("replaces complete group-instance snapshots without crossing owners", async () => {
        const { getCachedGroupInstances, replaceAllCachedGroupInstances, replaceCachedGroupInstances } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000055";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000056";
        const groupId = "grp_00000000-0000-0000-0000-000000000057";
        const worldId = "wrld_00000000-0000-0000-0000-000000000058";
        const instance = {
            id: `${worldId}:123~group(${groupId})~region(us)`,
            location: `${worldId}:123~group(${groupId})~region(us)`,
            instanceId: `123~group(${groupId})~region(us)`,
            worldId,
            ownerId: groupId,
            userCount: 12,
            capacity: 40,
            world: { id: worldId, name: "Remote Group World" },
        };
        const firstObservedAt = new Date("2026-08-09T10:00:00.000Z");
        await replaceCachedGroupInstances(ownerId, groupId, [instance], "2026-08-09T09:59:59.000Z", firstObservedAt);
        await replaceCachedGroupInstances(otherOwnerId, groupId, [instance]);

        expect(await getCachedGroupInstances(ownerId, groupId)).toEqual({ instances: [instance], upstreamFetchedAt: "2026-08-09T09:59:59.000Z", observedAt: firstObservedAt });
        expect((await getCachedGroupInstances(otherOwnerId, groupId))?.instances).toEqual([instance]);

        const secondGroupId = "grp_00000000-0000-0000-0000-000000000059";
        await replaceCachedGroupInstances(ownerId, secondGroupId, [{ ...instance, ownerId: secondGroupId, location: `${worldId}:456~group(${secondGroupId})`, id: `${worldId}:456~group(${secondGroupId})` }]);
        await replaceAllCachedGroupInstances(ownerId, [groupId], [instance], "2026-08-09T10:02:00.000Z", new Date("2026-08-09T10:02:01.000Z"));
        expect(await getCachedGroupInstances(ownerId, secondGroupId)).toBeNull();
        expect((await getCachedGroupInstances(otherOwnerId, groupId))?.instances).toEqual([instance]);

        const emptyObservedAt = new Date("2026-08-09T10:05:00.000Z");
        await replaceCachedGroupInstances(ownerId, groupId, [], undefined, emptyObservedAt);
        expect(await getCachedGroupInstances(ownerId, groupId)).toEqual({ instances: [], upstreamFetchedAt: undefined, observedAt: emptyObservedAt });
        expect((await getCachedGroupInstances(otherOwnerId, groupId))?.instances).toEqual([instance]);
    });

    test("replaces and updates complete group-calendar snapshots without crossing owners", async () => {
        const { getCachedGroupCalendar, replaceCachedGroupCalendar, updateCachedGroupCalendarEvent } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000065";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000066";
        const groupId = "grp_00000000-0000-0000-0000-000000000067";
        const calendarEvent = {
            id: "evt_calendar_one",
            ownerId: groupId,
            title: "Calendar One",
            description: "Remote event",
            startsAt: "2026-08-10T10:00:00.000Z",
            endsAt: "2026-08-10T11:00:00.000Z",
            accessType: "group",
            category: "hangout",
            closeInstanceAfterEndMinutes: 5,
            createdAt: "2026-08-01T00:00:00.000Z",
            deletedAt: null,
            durationInMs: 3_600_000,
            featured: false,
            guestEarlyJoinMinutes: 0,
            hostEarlyJoinMinutes: 0,
            imageId: null,
            interestedUserCount: 4,
            isDraft: false,
            languages: ["eng"],
            occurrenceKind: "single",
            platforms: ["standalonewindows"],
            recurrence: null,
            roleIds: null,
            seriesId: null,
            tags: [],
            type: "event",
            updatedAt: "2026-08-01T00:00:00.000Z",
            usesInstanceOverflow: false,
        };
        const observedAt = new Date("2026-08-09T11:00:00.000Z");
        await replaceCachedGroupCalendar(ownerId, groupId, [calendarEvent], false, 1, observedAt);
        await replaceCachedGroupCalendar(otherOwnerId, groupId, [calendarEvent], false, 1, observedAt);
        expect(await updateCachedGroupCalendarEvent(ownerId, groupId, { ...calendarEvent, userInterest: { isFollowing: true } })).toBe(true);
        expect((await getCachedGroupCalendar(ownerId, groupId))?.events[0].userInterest?.isFollowing).toBe(true);
        expect((await getCachedGroupCalendar(otherOwnerId, groupId))?.events[0].userInterest).toBeUndefined();

        await replaceCachedGroupCalendar(ownerId, groupId, [], false, 0);
        expect((await getCachedGroupCalendar(ownerId, groupId))?.events).toEqual([]);
        expect(await updateCachedGroupCalendarEvent(ownerId, groupId, { id: calendarEvent.id, userInterest: { isFollowing: false } })).toBe(false);
    });

    test("replaces complete group-gallery snapshots without crossing owners", async () => {
        const { getCachedGroupGalleries, replaceCachedGroupGalleries } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000071";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000072";
        const groupId = "grp_00000000-0000-0000-0000-000000000073";
        const galleryId = "ggal_00000000-0000-0000-0000-000000000074";
        const gallery = { id: galleryId, name: "Photos", description: "Remote photos", membersOnly: false };
        const image = { id: "ggim_00000000-0000-0000-0000-000000000075", groupId, galleryId, imageUrl: "https://api.vrchat.cloud/api/1/file/file_00000000-0000-0000-0000-000000000076/1/file" };
        const observedAt = new Date("2026-08-09T12:00:00.000Z");

        await replaceCachedGroupGalleries(ownerId, groupId, [gallery], [image], [galleryId], observedAt);
        await replaceCachedGroupGalleries(otherOwnerId, groupId, [gallery], [image], [], observedAt);
        expect(await getCachedGroupGalleries(ownerId, groupId)).toEqual({ galleries: [gallery], images: [image], truncatedGalleryIds: [galleryId], observedAt });
        expect((await getCachedGroupGalleries(otherOwnerId, groupId))?.truncatedGalleryIds).toEqual([]);

        const { getMongoDatabase } = await import("./client");
        await (await getMongoDatabase()).collection("group_gallery_snapshots").updateOne({ ownerId, groupId }, { $set: { "images.0.groupId": "grp_00000000-0000-0000-0000-000000000099" } });
        await expect(getCachedGroupGalleries(ownerId, groupId)).rejects.toThrow("did not match its owner");

        await replaceCachedGroupGalleries(ownerId, groupId, [], [], []);
        expect(await getCachedGroupGalleries(ownerId, groupId)).toMatchObject({ galleries: [], images: [], truncatedGalleryIds: [] });
        expect((await getCachedGroupGalleries(otherOwnerId, groupId))?.images).toEqual([image]);
    });

    test("updates group membership projection without crossing owners", async () => {
        const { setCachedGroupMembershipActive, upsertCachedGroups } = await import("./entity-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000081";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000082";
        const groupId = "grp_00000000-0000-0000-0000-000000000083";
        const group = { id: groupId, name: "Membership Group", membershipStatus: "member" };
        await upsertCachedGroups(ownerId, [group], "lookup");
        await upsertCachedGroups(otherOwnerId, [group], "lookup");

        const observedAt = new Date("2026-08-02T14:00:00.000Z");
        await setCachedGroupMembershipActive(ownerId, groupId, true, observedAt);

        const database = await getMongoDatabase();
        expect(await database.collection("groups").findOne({ ownerId, groupId })).toMatchObject({ membershipActive: true, membershipObservedAt: observedAt });
        expect((await database.collection("groups").findOne({ ownerId: otherOwnerId, groupId }))?.membershipActive).toBeUndefined();
    });

    test("stores and lists entity memos without leaking them between owners", async () => {
        const { getEntityMemo, listEntityMemos, saveEntityMemo } = await import("./memo-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000061";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000062";
        const worldId = "wrld_00000000-0000-0000-0000-000000000063";
        const userId = "usr_00000000-0000-0000-0000-000000000064";
        expect(await saveEntityMemo(ownerId, "world", worldId, "  Weekend meetup world  ")).toBe("Weekend meetup world");
        expect(await saveEntityMemo(ownerId, "user", userId, "Browser-port friend")).toBe("Browser-port friend");
        expect(await saveEntityMemo(otherOwnerId, "user", userId, "Other operator's memo")).toBe("Other operator's memo");
        expect(await getEntityMemo(ownerId, "world", worldId)).toBe("Weekend meetup world");
        expect(await getEntityMemo(otherOwnerId, "world", worldId)).toBe("");
        expect(await listEntityMemos(ownerId, "user", [userId, userId])).toEqual(new Map([[userId, "Browser-port friend"]]));
        expect(await listEntityMemos(ownerId, "world", [userId])).toEqual(new Map());
        expect(await saveEntityMemo(ownerId, "world", worldId, "")).toBe("");
        expect(await getEntityMemo(ownerId, "world", worldId)).toBe("");
    });

    test("creates owner-scoped recoverable note-export jobs from current friend memos", async () => {
        const { cancelNoteExportJob, claimNoteExportJob, getNoteExportJob, listNoteExportCandidates, NoteExportValidationError, startNoteExportJob } = await import("@/lib/note-export-job");
        const { saveEntityMemo } = await import("./memo-repository");
        const { collections } = await import("./collections");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000241";
        const friendA = "usr_00000000-0000-0000-0000-000000000242";
        const friendB = "usr_00000000-0000-0000-0000-000000000243";
        const now = new Date("2026-08-24T01:00:00.000Z");
        const c = collections(await getMongoDatabase());
        await c.friendSnapshots.insertMany([
            { _id: `${ownerId}:${friendA}`, ownerId, friendId: friendA, online: true, user: { id: friendA, displayName: "Zulu", note: "old" }, observedAt: now, updatedAt: now },
            { _id: `${ownerId}:${friendB}`, ownerId, friendId: friendB, online: false, user: { id: friendB, displayName: "Alpha", note: "Already current" }, observedAt: now, updatedAt: now },
        ]);
        await saveEntityMemo(ownerId, "user", friendA, "line one\nline two");
        await saveEntityMemo(ownerId, "user", friendB, "Already current");

        expect(await listNoteExportCandidates(ownerId)).toEqual([{ userId: friendA, displayName: "Zulu", note: "line one line two", imageUrl: undefined }]);
        expect(await startNoteExportJob(ownerId, [{ userId: friendA, note: "edited" }])).toBe(true);
        expect(await startNoteExportJob(ownerId, [{ userId: friendA, note: "duplicate" }])).toBe(false);
        expect(await getNoteExportJob(ownerId)).toMatchObject({ status: "queued", processed: 0, total: 1, items: [{ userId: friendA, note: "edited", status: "pending" }] });
        await expect(startNoteExportJob(ownerId, [{ userId: "usr_00000000-0000-0000-0000-000000000244", note: "not a friend memo" }])).rejects.toBeInstanceOf(NoteExportValidationError);
        expect(await cancelNoteExportJob(ownerId)).toBe(true);
        expect(await getNoteExportJob(ownerId)).toMatchObject({ status: "cancelled", cancelRequested: true });

        expect(await startNoteExportJob(ownerId, [{ userId: friendA, note: "restart-safe" }])).toBe(true);
        const concurrentClaims = await Promise.all([claimNoteExportJob(ownerId, now), claimNoteExportJob(ownerId, now)]);
        expect(concurrentClaims.filter(Boolean)).toHaveLength(1);
        const firstClaim = concurrentClaims.find(Boolean);
        expect(firstClaim).toEqual({ executionId: expect.any(String) });
        expect(await claimNoteExportJob(ownerId, new Date(now.getTime() + 10_000))).toBeNull();
        await c.noteExportJobs.updateOne({ _id: ownerId }, { $set: { heartbeatAt: new Date(now.getTime() - 31_000) } });
        const recoveryClaim = await claimNoteExportJob(ownerId, now);
        expect(recoveryClaim?.executionId).not.toBe(firstClaim?.executionId);
        expect(await claimNoteExportJob("usr_00000000-0000-0000-0000-000000000245", now)).toBeNull();
        expect(await cancelNoteExportJob(ownerId)).toBe(true);
    });

    test("projects remotely observed friend-request notifications into Friend Log once", async () => {
        const { replaceActiveNotifications, upsertPipelineNotification } = await import("@/lib/notifications/repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000021";
        const notification = { id: "not_friend_request", type: "friendRequest", senderUserId: "usr_00000000-0000-0000-0000-000000000022", senderUsername: "Request Sender", created_at: "2026-08-02T10:00:00.000Z" };

        await upsertPipelineNotification(ownerId, "legacy", notification, new Date("2026-08-02T10:00:01.000Z"));
        await replaceActiveNotifications(ownerId, "legacy", [notification], new Date("2026-08-02T10:01:00.000Z"));

        const activity = await (await getMongoDatabase()).collection("activity_events").find({ ownerId, type: "FriendRequest" }).toArray();
        expect(activity).toHaveLength(1);
        expect(activity[0]).toMatchObject({ subjectUserId: notification.senderUserId, displayName: "Request Sender", occurredAt: new Date(notification.created_at) });
    });

    test("transitions observed Game Log sessions with bounded timestamps", async () => {
        const { observeGameSession } = await import("@/lib/game-log/session-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const firstLocation = "wrld_00000000-0000-0000-0000-000000000010:12345~group(grp_00000000-0000-0000-0000-000000000020)";
        const secondLocation = "wrld_00000000-0000-0000-0000-000000000011:54321";

        await observeGameSession({ ownerId, location: firstLocation, observedAt: new Date("2026-08-02T11:00:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId, location: secondLocation, observedAt: new Date("2026-08-02T11:10:00.000Z"), provenance: "reconciliation" });
        await observeGameSession({ ownerId, location: "private", observedAt: new Date("2026-08-02T11:20:00.000Z"), provenance: "reconciliation" });

        const sessions = await (await getMongoDatabase()).collection("game_sessions").find({ ownerId }).sort({ startedAt: 1 }).toArray();
        expect(sessions).toHaveLength(2);
        expect(sessions[0]).toMatchObject({ location: firstLocation, current: false, closeReason: "location-change" });
        expect(sessions[1]).toMatchObject({ location: secondLocation, current: false, closeReason: "private" });
        expect(sessions[0]?.endedAt).toEqual(new Date("2026-08-02T11:10:00.000Z"));
    });

    test("ignores stale Game Log observations after a newer transition", async () => {
        const { observeGameSession } = await import("@/lib/game-log/session-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000004";
        const firstLocation = "wrld_00000000-0000-0000-0000-000000000010:11111";
        const secondLocation = "wrld_00000000-0000-0000-0000-000000000011:22222";

        await observeGameSession({ ownerId, location: firstLocation, observedAt: new Date("2026-08-02T12:00:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId, location: secondLocation, observedAt: new Date("2026-08-02T12:20:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId, location: firstLocation, observedAt: new Date("2026-08-02T12:10:00.000Z"), provenance: "reconciliation" });
        await observeGameSession({ ownerId, location: "private", observedAt: new Date("2026-08-02T12:15:00.000Z"), provenance: "reconciliation" });

        const sessions = await (await getMongoDatabase()).collection("game_sessions").find({ ownerId }).sort({ startedAt: 1 }).toArray();
        expect(sessions).toHaveLength(2);
        expect(sessions[1]).toMatchObject({ location: secondLocation, current: true, lastObservedAt: new Date("2026-08-02T12:20:00.000Z") });
    });

    test("queries Previous Instances from durable self sessions without local game-log data", async () => {
        const { observeGameSession } = await import("@/lib/game-log/session-repository");
        const { listPreviousInstances } = await import("./previous-instances-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000091";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000094";
        const worldId = "wrld_00000000-0000-0000-0000-000000000092";
        const groupId = "grp_00000000-0000-0000-0000-000000000093";
        const firstLocation = `${worldId}:111~group(${groupId})~region(us)`;
        const secondLocation = `${worldId}:222~group(${groupId})~region(eu)`;

        await observeGameSession({ ownerId, location: firstLocation, worldName: "Observed World", groupName: "Observed Group", observedAt: new Date("2026-08-09T13:00:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId, location: secondLocation, worldName: "Observed World", groupName: "Observed Group", observedAt: new Date("2026-08-09T13:10:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId, location: firstLocation, worldName: "Observed World", groupName: "Observed Group", observedAt: new Date("2026-08-09T13:30:00.000Z"), provenance: "reconciliation" });
        await observeGameSession({ ownerId, location: "private", observedAt: new Date("2026-08-09T13:50:00.000Z"), provenance: "reconciliation" });
        await observeGameSession({ ownerId: otherOwnerId, location: firstLocation, observedAt: new Date("2026-08-09T12:00:00.000Z"), provenance: "pipeline" });
        await observeGameSession({ ownerId: otherOwnerId, location: "offline", observedAt: new Date("2026-08-09T14:00:00.000Z"), provenance: "pipeline" });

        const userRows = await listPreviousInstances(ownerId, "user", ownerId);
        expect(userRows).toHaveLength(3);
        expect(userRows.map((row) => row.source)).toEqual(["active-account-session", "active-account-session", "active-account-session"]);

        const worldRows = await listPreviousInstances(ownerId, "world", worldId);
        expect(worldRows).toHaveLength(2);
        expect(worldRows.find((row) => row.location === firstLocation)).toMatchObject({ worldName: "Observed World", groupName: "Observed Group", observationCount: 2, durationMs: 30 * 60_000, current: false });
        expect(worldRows.find((row) => row.location === secondLocation)).toMatchObject({ observationCount: 1, durationMs: 20 * 60_000 });

        const groupRows = await listPreviousInstances(ownerId, "group", groupId);
        expect(groupRows.map((row) => row.location)).toEqual(worldRows.map((row) => row.location));
    });

    test("ranks Hot Worlds from owner-scoped friend GPS history", async () => {
        const { listHotWorldFriends, listHotWorlds } = await import("./hot-worlds-repository");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const ownerId = "usr_00000000-0000-0000-0000-0000000000c1";
        const otherOwnerId = "usr_00000000-0000-0000-0000-0000000000c2";
        const friendId = "usr_00000000-0000-0000-0000-0000000000c3";
        const otherFriendId = "usr_00000000-0000-0000-0000-0000000000c4";
        const worldId = "wrld_00000000-0000-0000-0000-0000000000c5";
        const now = new Date("2026-08-10T00:00:00.000Z");
        const database = await getMongoDatabase();
        const c = collections(database);
        await c.worlds.insertOne({ _id: `${ownerId}:${worldId}`, ownerId, worldId, world: { id: worldId, name: "Remote Hot World" }, source: "session", observedAt: now, updatedAt: now });
        await c.activityEvents.insertMany([
            { _id: "hot-owner-old", ownerId, type: "GPS", subjectUserId: friendId, displayName: "Observed Friend", current: `${worldId}:111`, occurredAt: new Date("2026-07-20T00:00:00.000Z"), observedAt: now, provenance: "pipeline" },
            { _id: "hot-owner-recent", ownerId, type: "GPS", subjectUserId: otherFriendId, displayName: "Other Friend", current: `${worldId}:222`, occurredAt: new Date("2026-08-05T00:00:00.000Z"), observedAt: now, provenance: "reconciliation" },
            { _id: "hot-self", ownerId, type: "GPS", subjectUserId: ownerId, displayName: "Self", current: `${worldId}:333`, occurredAt: new Date("2026-08-06T00:00:00.000Z"), observedAt: now, provenance: "pipeline" },
            { _id: "hot-other-owner", ownerId: otherOwnerId, type: "GPS", subjectUserId: friendId, displayName: "Leaked Friend", current: `${worldId}:444`, occurredAt: new Date("2026-08-07T00:00:00.000Z"), observedAt: now, provenance: "pipeline" },
            { _id: "hot-status", ownerId, type: "Status", subjectUserId: friendId, displayName: "Observed Friend", current: `${worldId}:555`, occurredAt: new Date("2026-08-08T00:00:00.000Z"), observedAt: now, provenance: "pipeline" },
        ]);

        expect(await listHotWorlds(ownerId, 30, now)).toEqual([expect.objectContaining({ worldId, worldName: "Remote Hot World", visitCount: 2, uniqueFriends: 2, trend: "stable" })]);
        expect(await listHotWorldFriends(ownerId, worldId, 30, now)).toEqual([expect.objectContaining({ userId: otherFriendId, displayName: "Other Friend", visitCount: 1 }), expect.objectContaining({ userId: friendId, displayName: "Observed Friend", visitCount: 1 })]);
    });

    test("retains inactive favorite and moderation projections for history", async () => {
        const { clearFavoriteGroupProjection, isAvatarBlocked, replaceAvatarModerationProjection, replaceFavoriteProjection, replaceModerationProjection, upsertFavoriteGroupProjection } = await import("./projection-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000002";
        const favorite = { id: "fvrt_1", favoriteId: "wrld_00000000-0000-0000-0000-000000000010", type: "world", tags: ["world1"] };
        const favoriteGroup = { id: "favorite-group-1", ownerId, name: "world1", displayName: "Worlds", type: "world", visibility: "private" };
        const moderation = { type: "block", sourceUserId: ownerId, targetUserId: "usr_00000000-0000-0000-0000-000000000003" };
        const avatarModeration = { avatarModerationType: "block" as const, created: "2026-08-17T12:00:00.000Z", targetAvatarId: "avtr_00000000-0000-0000-0000-000000000010" };

        await replaceFavoriteProjection(ownerId, [favorite]);
        await upsertFavoriteGroupProjection(ownerId, favoriteGroup);
        await clearFavoriteGroupProjection(ownerId, "world", "world1");
        await replaceModerationProjection(ownerId, [moderation]);
        await replaceAvatarModerationProjection(ownerId, [avatarModeration]);
        expect(await isAvatarBlocked(ownerId, avatarModeration.targetAvatarId)).toBe(true);
        expect(await isAvatarBlocked(otherOwnerId, avatarModeration.targetAvatarId)).toBe(false);
        await replaceFavoriteProjection(ownerId, []);
        await replaceModerationProjection(ownerId, []);
        await replaceAvatarModerationProjection(ownerId, []);

        const database = await getMongoDatabase();
        expect(await database.collection("favorites").findOne({ ownerId, recordId: favorite.id })).toMatchObject({ active: false, objectId: favorite.favoriteId });
        expect(await database.collection("favorite_groups").findOne({ ownerId, groupId: favoriteGroup.id })).toMatchObject({ active: true, group: favoriteGroup });
        expect(await database.collection("moderations").findOne({ ownerId, targetUserId: moderation.targetUserId })).toMatchObject({ active: false, moderationType: "block" });
        expect(await database.collection("avatar_moderations").findOne({ ownerId, targetAvatarId: avatarModeration.targetAvatarId })).toMatchObject({ active: false, moderationType: "block" });
        expect(await isAvatarBlocked(ownerId, avatarModeration.targetAvatarId)).toBe(false);
    });

    test("applies typed Pipeline friend events directly and records provenance", async () => {
        const { applyPipelineFriendEvent } = await import("@/lib/monitor/friend-events");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000005";
        const friendId = "usr_00000000-0000-0000-0000-000000000006";
        const addedAt = new Date("2026-08-02T13:00:00.000Z");
        const movedAt = new Date("2026-08-02T13:05:00.000Z");
        const offlineAt = new Date("2026-08-02T13:10:00.000Z");

        expect(await applyPipelineFriendEvent(ownerId, "friend-add", { userId: friendId, user: { id: friendId, displayName: "Pipeline Friend", state: "online", location: "wrld_00000000-0000-0000-0000-000000000010:11111" } }, addedAt)).toBe(true);
        expect(await applyPipelineFriendEvent(ownerId, "friend-location", { userId: friendId, location: "wrld_00000000-0000-0000-0000-000000000011:22222" }, movedAt)).toBe(true);
        expect(await applyPipelineFriendEvent(ownerId, "friend-location", { userId: friendId, location: "wrld_00000000-0000-0000-0000-000000000011:22222" }, movedAt)).toBe(true);
        expect(await applyPipelineFriendEvent(ownerId, "friend-offline", { userId: friendId }, offlineAt)).toBe(true);
        expect(await applyPipelineFriendEvent(ownerId, "friend-online", { userId: friendId, location: "wrld_00000000-0000-0000-0000-000000000010:stale" }, movedAt)).toBe(true);

        const database = await getMongoDatabase();
        expect(await database.collection("friend_snapshots").findOne({ ownerId, friendId })).toMatchObject({ online: false, user: { state: "offline" }, updatedAt: offlineAt });
        const activity = await database.collection("activity_events").find({ ownerId }).toArray();
        expect(activity.map((event) => event.type)).toEqual(expect.arrayContaining(["Friend", "GPS", "Offline"]));
        expect(activity.filter((event) => event.type === "GPS")).toHaveLength(1);
        expect(activity.every((event) => event.provenance === "pipeline")).toBe(true);

        expect(await applyPipelineFriendEvent(ownerId, "friend-delete", { userId: friendId }, new Date("2026-08-02T13:15:00.000Z"))).toBe(true);
        expect(await database.collection("friend_snapshots").findOne({ ownerId, friendId })).toBeNull();
        expect(await database.collection("activity_events").findOne({ ownerId, type: "Unfriend" })).not.toBeNull();
    });

    test("records self activity without relationship events and associates it with Game Log sessions", async () => {
        const { listGameSessionActivities, listGameSessions, observeGameSession } = await import("@/lib/game-log/session-repository");
        const { applyPipelineSelfEvent, applySelfSnapshot } = await import("@/lib/monitor/self-events");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-0000000000b5";
        const firstLocation = "wrld_00000000-0000-0000-0000-0000000000b6:11111";
        const secondLocation = "wrld_00000000-0000-0000-0000-0000000000b7:22222";
        const baselineAt = new Date("2026-08-02T14:00:00.000Z");
        const statusAt = new Date("2026-08-02T14:05:00.000Z");
        const movedAt = new Date("2026-08-02T14:10:00.000Z");
        const offlineAt = new Date("2026-08-02T14:20:00.000Z");

        await observeGameSession({ ownerId, location: firstLocation, observedAt: baselineAt, provenance: "reconciliation" });
        await applySelfSnapshot(ownerId, { id: ownerId, displayName: "Self Operator", state: "online", status: "active", statusDescription: "Baseline", location: firstLocation }, baselineAt, "reconciliation");
        await applyPipelineSelfEvent(ownerId, "user-update", { user: { status: "join me", statusDescription: "Own update" } }, statusAt);
        await applyPipelineSelfEvent(ownerId, "user-update", { user: { status: "join me", statusDescription: "Own update" } }, statusAt);
        await applyPipelineSelfEvent(ownerId, "user-location", { userId: ownerId, location: secondLocation }, movedAt);
        await observeGameSession({ ownerId, location: secondLocation, observedAt: movedAt, provenance: "pipeline" });
        await applyPipelineSelfEvent(ownerId, "user-location", { userId: ownerId, location: "offline" }, offlineAt);
        await observeGameSession({ ownerId, location: "offline", observedAt: offlineAt, provenance: "pipeline" });

        const database = await getMongoDatabase();
        const activity = await database.collection("activity_events").find({ ownerId }).sort({ occurredAt: 1 }).toArray();
        expect(activity.map((event) => event.type)).toEqual(["Status", "GPS", "Offline"]);
        expect(activity.every((event) => event.subjectUserId === ownerId)).toBe(true);
        expect(await database.collection("activity_events").countDocuments({ ownerId, type: { $in: ["Friend", "Unfriend"] } })).toBe(0);
        expect(await database.collection("friend_snapshots").countDocuments({ ownerId })).toBe(0);
        expect(await database.collection("self_snapshots").findOne({ ownerId })).toMatchObject({ userId: ownerId, online: false, updatedAt: offlineAt });

        const sessions = await listGameSessions({ ownerId, limit: 10 });
        const eventsBySession = await listGameSessionActivities(ownerId, sessions.sessions);
        const first = sessions.sessions.find((session) => session.location === firstLocation);
        const second = sessions.sessions.find((session) => session.location === secondLocation);
        expect(first && eventsBySession.get(first._id)?.map((event) => event.type)).toEqual(["Status"]);
        expect(second && eventsBySession.get(second._id)?.map((event) => event.type)).toEqual(["Offline", "GPS"]);
        expect(first && (await listGameSessionActivities(ownerId, [first])).get(first._id)?.map((event) => event.type)).toEqual(["Status"]);
    });

    test("deduplicates interrupted friend transitions across Pipeline and reconciliation", async () => {
        const { persistActivityTransitions } = await import("@/lib/monitor/activity-events");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000091";
        const friendId = "usr_00000000-0000-0000-0000-000000000092";
        const initialFriend: FriendActivity = { id: "initial", type: "Friend", userId: friendId, displayName: "Retry Friend", createdAt: "2026-08-02T15:00:00.000Z" };

        await persistActivityTransitions({ ownerId, events: [initialFriend], previousDocuments: [], observedAt: new Date("2026-08-02T15:00:00.000Z"), provenance: "pipeline" });
        await persistActivityTransitions({ ownerId, events: [{ ...initialFriend, id: "reconciled", createdAt: "2026-08-02T15:00:10.000Z" }], previousDocuments: [], observedAt: new Date("2026-08-02T15:00:10.000Z"), provenance: "reconciliation" });

        const previous: FriendSnapshotDocument = {
            _id: `${ownerId}:${friendId}`,
            ownerId,
            friendId,
            online: true,
            user: { id: friendId, displayName: "Retry Friend", state: "online", location: "wrld_00000000-0000-0000-0000-000000000010:11111" },
            observedAt: new Date("2026-08-02T15:00:00.000Z"),
            updatedAt: new Date("2026-08-02T15:00:00.000Z"),
        };
        const moved: FriendActivity = { id: "move", type: "GPS", userId: friendId, displayName: "Retry Friend", previous: "wrld_00000000-0000-0000-0000-000000000010:11111", current: "wrld_00000000-0000-0000-0000-000000000011:22222", createdAt: "2026-08-02T15:05:00.000Z" };
        await persistActivityTransitions({ ownerId, events: [moved], previousDocuments: [previous], observedAt: new Date(moved.createdAt), provenance: "pipeline" });
        await persistActivityTransitions({ ownerId, events: [{ ...moved, id: "move-retry", createdAt: "2026-08-02T15:05:10.000Z" }], previousDocuments: [previous], observedAt: new Date("2026-08-02T15:05:10.000Z"), provenance: "reconciliation" });

        const database = await getMongoDatabase();
        expect(await database.collection("activity_events").countDocuments({ ownerId, type: "Friend" })).toBe(1);
        expect(await database.collection("activity_events").countDocuments({ ownerId, type: "GPS" })).toBe(1);
        expect(await database.collection("activity_events").findOne({ ownerId, type: "GPS" })).toMatchObject({ provenance: "pipeline", observedAt: new Date("2026-08-02T15:05:00.000Z"), previousSnapshotObservedAt: previous.updatedAt });

        const unfriended: FriendActivity = { id: "unfriend", type: "Unfriend", userId: friendId, displayName: "Retry Friend", createdAt: "2026-08-02T15:10:00.000Z" };
        await persistActivityTransitions({ ownerId, events: [unfriended], previousDocuments: [previous], observedAt: new Date(unfriended.createdAt), provenance: "pipeline" });
        const readded: FriendActivity = { ...initialFriend, id: "readded", createdAt: "2026-08-02T15:15:00.000Z" };
        await persistActivityTransitions({ ownerId, events: [readded], previousDocuments: [], observedAt: new Date(readded.createdAt), provenance: "pipeline" });
        await persistActivityTransitions({ ownerId, events: [{ ...readded, id: "readded-retry", createdAt: "2026-08-02T15:15:10.000Z" }], previousDocuments: [], observedAt: new Date("2026-08-02T15:15:10.000Z"), provenance: "reconciliation" });
        expect(await database.collection("activity_events").countDocuments({ ownerId, type: "Friend" })).toBe(2);
    });

    test("purges only eligible avatar feed history and runs automatic cleanup weekly", async () => {
        const { purgeAvatarFeedData, runAvatarAutoCleanup } = await import("@/lib/monitor/avatar-cleanup");
        const { getMongoDatabase } = await import("./client");
        const { collections } = await import("./collections");
        const ownerId = "usr_00000000-0000-0000-0000-0000000000a1";
        const otherOwnerId = "usr_00000000-0000-0000-0000-0000000000a2";
        const subjectUserId = "usr_00000000-0000-0000-0000-0000000000a3";
        const now = new Date("2026-08-08T16:00:00.000Z");
        const c = collections(await getMongoDatabase());
        await c.appSettings.updateOne({ _id: "singleton" }, { $set: { activeUserId: ownerId, avatarAutoCleanupDays: 30, updatedAt: now } });
        await c.monitorState.updateOne({ _id: "singleton" }, { $set: { ownerId, updatedAt: now }, $unset: { lastAvatarCleanupAt: "", lastAvatarAutoCleanupAt: "" } });
        await c.activityEvents.insertMany([
            { _id: "cleanup-old-avatar", ownerId, type: "Avatar", subjectUserId, displayName: "Cleanup Friend", occurredAt: new Date("2026-06-01T00:00:00.000Z"), observedAt: new Date("2026-06-01T00:00:00.000Z"), provenance: "pipeline" },
            { _id: "cleanup-current-avatar", ownerId, type: "Avatar", subjectUserId, displayName: "Cleanup Friend", occurredAt: new Date("2026-08-01T00:00:00.000Z"), observedAt: new Date("2026-08-01T00:00:00.000Z"), provenance: "pipeline" },
            { _id: "cleanup-old-gps", ownerId, type: "GPS", subjectUserId, displayName: "Cleanup Friend", occurredAt: new Date("2026-06-01T00:00:00.000Z"), observedAt: new Date("2026-06-01T00:00:00.000Z"), provenance: "pipeline" },
            { _id: "cleanup-other-owner", ownerId: otherOwnerId, type: "Avatar", subjectUserId, displayName: "Other Friend", occurredAt: new Date("2026-06-01T00:00:00.000Z"), observedAt: new Date("2026-06-01T00:00:00.000Z"), provenance: "pipeline" },
        ]);

        expect(await runAvatarAutoCleanup(ownerId, now)).toMatchObject({ ran: true, days: 30, deleted: 1, cutoff: new Date("2026-07-09T16:00:00.000Z") });
        await c.activityEvents.insertOne({ _id: "cleanup-weekly-guard", ownerId, type: "Avatar", subjectUserId, displayName: "Cleanup Friend", occurredAt: new Date("2026-06-02T00:00:00.000Z"), observedAt: new Date("2026-06-02T00:00:00.000Z"), provenance: "reconciliation" });
        expect(await runAvatarAutoCleanup(ownerId, new Date("2026-08-14T16:00:00.000Z"))).toMatchObject({ ran: false, deleted: 0 });
        expect(await c.activityEvents.findOne({ _id: "cleanup-weekly-guard" })).not.toBeNull();
        expect(await runAvatarAutoCleanup(ownerId, new Date("2026-08-15T16:00:00.000Z"))).toMatchObject({ ran: true, deleted: 1 });

        expect(await purgeAvatarFeedData(ownerId, null, new Date("2026-08-15T17:00:00.000Z"))).toMatchObject({ ran: true, days: null, deleted: 1 });
        expect(await c.activityEvents.findOne({ _id: "cleanup-old-gps" })).not.toBeNull();
        expect(await c.activityEvents.findOne({ _id: "cleanup-other-owner" })).not.toBeNull();
        expect(await c.monitorState.findOne({ _id: "singleton" })).toMatchObject({ ownerId, lastAvatarCleanupAt: new Date("2026-08-15T17:00:00.000Z"), lastAvatarAutoCleanupAt: new Date("2026-08-15T16:00:00.000Z"), lastAvatarCleanupDeleted: 1 });
    });
});
