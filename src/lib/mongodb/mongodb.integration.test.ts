import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

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
        const { ensureMongoSchema } = await import("./migrations");
        await ensureMongoSchema();
        await ensureMongoSchema();

        const database = await getMongoDatabase();
        const migrations = await database.collection("schema_migrations").find().sort({ _id: 1 }).toArray();
        expect(migrations.map((migration) => migration._id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        expect(await database.collection("app_settings").findOne({ _id: "singleton" })).toMatchObject({
            notificationFilters: [],
            notificationTablePageSize: 20,
            favoriteSortByDate: false,
            favoriteCardScale: { avatar: 1, friend: 1, world: 1 },
            favoriteCardSpacing: { avatar: 1, friend: 1, world: 1 },
        });
        const sessionIndexes = await database.collection("game_sessions").indexExists(["owner_started", "one_open_session_per_owner"]);
        expect(sessionIndexes).toBe(true);
    });

    test("stores encrypted session material and isolates cached users by owner", async () => {
        const { saveAuthenticatedVrchatSession, getStoredVrchatSession } = await import("./session-repository");
        const { upsertCachedUser, getCachedUser } = await import("./user-repository");
        const ownerId = "usr_00000000-0000-0000-0000-000000000001";
        const otherOwnerId = "usr_00000000-0000-0000-0000-000000000002";
        const user = { id: ownerId, displayName: "Mongo User" };

        await saveAuthenticatedVrchatSession({ auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" }, ownerId);
        await upsertCachedUser(ownerId, user, "auth");

        expect(await getStoredVrchatSession()).toMatchObject({ status: "authenticated", activeUserId: ownerId, cookies: { auth: "auth-cookie", twoFactorAuth: "two-factor-cookie" } });
        expect(await getCachedUser(ownerId, ownerId)).toMatchObject(user);
        expect(await getCachedUser(otherOwnerId, ownerId)).toBeNull();
    });

    test("rejects stale cookie rotation after an active-account replacement", async () => {
        const { clearStoredVrchatSession, getStoredVrchatSession, saveAuthenticatedVrchatSession, updateStoredVrchatCookies } = await import("./session-repository");
        const firstOwnerId = "usr_00000000-0000-0000-0000-000000000010";
        const secondOwnerId = "usr_00000000-0000-0000-0000-000000000011";
        await saveAuthenticatedVrchatSession({ auth: "first-auth" }, firstOwnerId);
        await saveAuthenticatedVrchatSession({ auth: "second-auth" }, secondOwnerId);

        expect(await updateStoredVrchatCookies({ twoFactorAuth: "stale-cookie" }, { activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await clearStoredVrchatSession({ activeUserId: firstOwnerId, authCookie: "first-auth" })).toBe(false);
        expect(await getStoredVrchatSession()).toMatchObject({ activeUserId: secondOwnerId, cookies: { auth: "second-auth" } });
        expect((await getStoredVrchatSession())?.cookies.twoFactorAuth).toBeUndefined();
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
        const { acquireMonitorLease } = await import("@/lib/monitor/lease");
        const firstTick = new Date("2026-08-02T10:00:00.000Z");
        expect(await acquireMonitorLease("monitor-a", firstTick)).toBe(true);
        expect(await acquireMonitorLease("monitor-b", firstTick)).toBe(false);
        expect(await acquireMonitorLease("monitor-b", new Date(firstTick.getTime() + 60_001))).toBe(true);
        expect(await acquireMonitorLease("monitor-a", new Date(firstTick.getTime() + 60_002))).toBe(false);
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
        expect(await applyPipelineFriendEvent(ownerId, "friend-offline", { userId: friendId }, offlineAt)).toBe(true);
        expect(await applyPipelineFriendEvent(ownerId, "friend-online", { userId: friendId, location: "wrld_00000000-0000-0000-0000-000000000010:stale" }, movedAt)).toBe(true);

        const database = await getMongoDatabase();
        expect(await database.collection("friend_snapshots").findOne({ ownerId, friendId })).toMatchObject({ online: false, user: { state: "offline" }, updatedAt: offlineAt });
        const activity = await database.collection("activity_events").find({ ownerId }).toArray();
        expect(activity.map((event) => event.type)).toEqual(expect.arrayContaining(["Friend", "GPS", "Offline"]));
        expect(activity.every((event) => event.provenance === "pipeline")).toBe(true);

        expect(await applyPipelineFriendEvent(ownerId, "friend-delete", { userId: friendId }, new Date("2026-08-02T13:15:00.000Z"))).toBe(true);
        expect(await database.collection("friend_snapshots").findOne({ ownerId, friendId })).toBeNull();
        expect(await database.collection("activity_events").findOne({ ownerId, type: "Unfriend" })).not.toBeNull();
    });
});
