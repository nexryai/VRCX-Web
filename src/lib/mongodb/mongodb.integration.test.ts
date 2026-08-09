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
        const migrations = await database.collection("schema_migrations").find().sort({ _id: 1 }).toArray();
        expect(migrations.map((migration) => migration._id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
        expect(await database.collection("app_settings").findOne({ _id: "singleton" })).toMatchObject({
            notificationFilters: [],
            notificationTablePageSize: 20,
            myAvatarsCardScale: 0.6,
            myAvatarsCardSpacing: 1,
            myAvatarsTablePageSize: 20,
            favoriteSortByDate: false,
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
        const sessionIndexes = await database.collection("game_sessions").indexExists(["owner_started", "one_open_session_per_owner"]);
        expect(sessionIndexes).toBe(true);
        expect(await database.collection("group_posts").indexExists("owner_group_post_unique")).toBe(true);
        expect(await database.collection("group_members").indexExists("owner_group_user_unique")).toBe(true);
        expect(await database.collection("entity_memos").indexExists("owner_type_entity_unique")).toBe(true);
        expect(await database.collection("activity_events").indexExists("owner_type_occurred")).toBe(true);
        expect(await database.collection("self_snapshots").indexExists("owner_unique")).toBe(true);
        expect(await collections(database).monitorState.findOne({ _id: "singleton" })).toMatchObject({ pipelineSequence: 0 });
        expect(await collections(database).appSettings.findOne({ _id: "singleton" })).toMatchObject({ avatarAutoCleanupDays: 0 });
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
        const { saveAuthenticatedVrchatSession, getStoredVrchatSession } = await import("./session-repository");
        const { upsertCachedUser, getCachedUser } = await import("./user-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000002";
        const user = { id: ownerId, displayName: "Mongo User" };

        await saveAuthenticatedVrchatSession({ auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" }, ownerId);
        await upsertCachedUser(ownerId, user, "auth", new Date("2026-08-02T08:00:00.000Z"));
        await upsertCachedUser(ownerId, { ...user, displayName: "Fresh Mongo User" }, "friends", new Date("2026-08-02T08:10:00.000Z"));
        await upsertCachedUser(ownerId, { ...user, displayName: "Stale Mongo User" }, "friends", new Date("2026-08-02T08:05:00.000Z"));

        expect(await getStoredVrchatSession()).toMatchObject({ status: "authenticated", activeUserId: ownerId, cookies: { auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" } });
        expect(await getCachedUser(ownerId, ownerId)).toMatchObject({ ...user, displayName: "Fresh Mongo User" });
        expect(await getCachedUser(otherOwnerId, ownerId)).toBeNull();
    });

    test("patches relationship and note fields in both user projections", async () => {
        const { getMongoDatabase } = await import("./client");
        const { getCachedUser, patchCachedUser, upsertCachedUser } = await import("./user-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000071";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000072";
        const userId = "usr_00000000-0000-0000-0000-000000000073";
        const user = { id: userId, displayName: "Relationship User", friendRequestStatus: "outgoing" };
        await upsertCachedUser(ownerId, user, "lookup");
        await upsertCachedUser(otherOwnerId, user, "lookup");
        await (await getMongoDatabase()).collection("friend_snapshots").insertOne({
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
        await saveAuthenticatedVrchatSession({ auth: "second-auth" }, secondOwnerId);

        expect(await updateStoredVrchatCookies({ twoFactorAuth: "stale-cookie" }, { activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await clearStoredVrchatSession({ activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await getStoredVrchatSession()).toMatchObject({ activeUserId: secondOwnerId, cookies: { auth: "second-auth" } });
        expect((await getStoredVrchatSession())?.cookies.twoFactorAuth).toBeUndefined();
        expect(await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" })).toMatchObject({ ownerId: secondOwnerId, pipelineSequence: 0, status: "starting", pipelineConnected: false });
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastPipelineEventKey).toBeUndefined();
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastAvatarCleanupAt).toBeUndefined();
        expect((await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }))?.lastAvatarAutoCleanupAt).toBeUndefined();
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

    test("keeps notification history while updating the active projection", async () => {
        const { replaceActiveNotifications, listActiveNotifications } = await import("@/lib/notifications/repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const first = new Date("2026-08-02T10:00:00.000Z");
        const second = new Date("2026-08-02T10:05:00.000Z");

        await replaceActiveNotifications(ownerId, "legacy", [{ id: "not_first", type: "invite", message: "First" }], first);
        await replaceActiveNotifications(ownerId, "legacy", [{ id: "not_second", type: "invite", message: "Second" }], second);

        expect((await listActiveNotifications(ownerId, "legacy", 0)).map((notification) => notification.id)).toEqual(["not_second"]);
        const retained = await (await getMongoDatabase()).collection("notifications").find({ ownerId }).toArray();
        expect(retained).toHaveLength(2);
        expect(retained.find((document) => document.notificationId === "not_first")?.active).toBe(false);
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
        const { listCachedGroupMembers, listCachedGroupPosts, replaceCachedGroupPosts, upsertCachedGroupMembers } = await import("./group-dialog-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000051";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000052";
        const groupId = "grp_00000000-0000-0000-0000-000000000053";
        const userId = "usr_00000000-0000-0000-0000-000000000054";
        await replaceCachedGroupPosts(ownerId, groupId, [{ id: "gpos_one", title: "First", text: "Visible", roleIds: [] }]);
        await replaceCachedGroupPosts(ownerId, groupId, [{ id: "gpos_two", title: "Second", text: "Replacement", roleIds: [] }]);
        await upsertCachedGroupMembers(ownerId, groupId, [{ id: "gmem_one", userId, roleIds: [], user: { id: userId, displayName: "Group Member" } }]);

        expect(await listCachedGroupPosts(ownerId, groupId)).toEqual([expect.objectContaining({ id: "gpos_two" })]);
        const { getMongoDatabase } = await import("./client");
        expect(await (await getMongoDatabase()).collection("group_posts").findOne({ ownerId, groupId, postId: "gpos_one" })).toMatchObject({ active: false });
        expect(await listCachedGroupPosts(otherOwnerId, groupId)).toEqual([]);
        expect(await listCachedGroupMembers(ownerId, groupId, 0, 100)).toMatchObject({ total: 1, members: [expect.objectContaining({ userId })] });
        expect(await listCachedGroupMembers(otherOwnerId, groupId, 0, 100)).toEqual({ total: 0, members: [] });
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

    test("stores entity memos without leaking them between owners", async () => {
        const { getEntityMemo, saveEntityMemo } = await import("./memo-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000061";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000062";
        const worldId = "wrld_00000000-0000-0000-0000-000000000063";
        expect(await saveEntityMemo(ownerId, "world", worldId, "  Weekend meetup world  ")).toBe("Weekend meetup world");
        expect(await getEntityMemo(ownerId, "world", worldId)).toBe("Weekend meetup world");
        expect(await getEntityMemo(otherOwnerId, "world", worldId)).toBe("");
        expect(await saveEntityMemo(ownerId, "world", worldId, "")).toBe("");
        expect(await getEntityMemo(ownerId, "world", worldId)).toBe("");
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

    test("retains inactive favorite and moderation projections for history", async () => {
        const { clearFavoriteGroupProjection, replaceFavoriteProjection, replaceModerationProjection, upsertFavoriteGroupProjection } = await import("./projection-repository");
        const { getMongoDatabase } = await import("./client");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const favorite = { id: "fvrt_1", favoriteId: "wrld_00000000-0000-0000-0000-000000000010", type: "world", tags: ["world1"] };
        const favoriteGroup = { id: "favorite-group-1", ownerId, name: "world1", displayName: "Worlds", type: "world", visibility: "private" };
        const moderation = { type: "block", sourceUserId: ownerId, targetUserId: "usr_00000000-0000-0000-0000-000000000003" };

        await replaceFavoriteProjection(ownerId, [favorite]);
        await upsertFavoriteGroupProjection(ownerId, favoriteGroup);
        await clearFavoriteGroupProjection(ownerId, "world", "world1");
        await replaceModerationProjection(ownerId, [moderation]);
        await replaceFavoriteProjection(ownerId, []);
        await replaceModerationProjection(ownerId, []);

        const database = await getMongoDatabase();
        expect(await database.collection("favorites").findOne({ ownerId, recordId: favorite.id })).toMatchObject({ active: false, objectId: favorite.favoriteId });
        expect(await database.collection("favorite_groups").findOne({ ownerId, groupId: favoriteGroup.id })).toMatchObject({ active: true, group: favoriteGroup });
        expect(await database.collection("moderations").findOne({ ownerId, targetUserId: moderation.targetUserId })).toMatchObject({ active: false, moderationType: "block" });
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
        expect(await database.collection("activity_events").findOne({ ownerId, type: "GPS" })).toMatchObject({ provenance: "pipeline", observedAt: new Date("2026-08-02T15:05:00.000Z") });

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
