import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const port = process.env.VRCX_VISUAL_PORT || "3210";
const databaseName = "vrcx_visual";
const encryptionKey = Buffer.alloc(32, 11);
const ownerId = "usr_00000000-0000-0000-0000-000000000001";

function encryptedCookies(cookies) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cookies), "utf8"), cipher.final()]);
    return { algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

function activityId(value) {
    return createHash("sha256").update(value).digest("hex");
}

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const database = client.db(databaseName);
const now = new Date();
const friends = [
    {
        id: "usr_00000000-0000-0000-0000-000000000002",
        displayName: "Aoi Sample",
        username: "aoi_sample",
        state: "online",
        status: "join me",
        statusDescription: "Building a new world",
        bio: "World creator and explorer",
        bioLinks: ["https://example.com/aoi"],
        tags: ["system_trust_trusted", "language_eng", "language_jpn"],
        date_joined: "2021-04-12",
        last_activity: new Date(now.getTime() - 5 * 60_000).toISOString(),
        last_login: new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
        location: "wrld_00000000-0000-0000-0000-000000000010:12345",
        world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" },
    },
    {
        id: "usr_00000000-0000-0000-0000-000000000003",
        displayName: "Cobalt Friend",
        username: "cobalt_friend",
        state: "online",
        status: "ask me",
        statusDescription: "Come say hello",
        bio: "Avatar enthusiast",
        tags: ["system_trust_known", "language_eng"],
        date_joined: "2022-09-23",
        last_activity: new Date(now.getTime() - 18 * 60_000).toISOString(),
        last_login: new Date(now.getTime() - 5 * 60 * 60_000).toISOString(),
        location: "wrld_00000000-0000-0000-0000-000000000010:12345",
        world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" },
    },
    {
        id: "usr_00000000-0000-0000-0000-000000000004",
        displayName: "Mikan Active",
        username: "mikan_active",
        state: "active",
        status: "active",
        statusDescription: "Browsing VRChat",
        tags: ["system_trust_basic", "language_jpn"],
        date_joined: "2024-01-08",
        last_activity: new Date(now.getTime() - 34 * 60_000).toISOString(),
        location: "offline",
    },
    {
        id: "usr_00000000-0000-0000-0000-000000000005",
        displayName: "Nora Offline",
        username: "nora_offline",
        state: "offline",
        status: "offline",
        statusDescription: "See you later",
        tags: ["language_deu"],
        date_joined: "2025-06-17",
        last_activity: new Date(now.getTime() - 8 * 60 * 60_000).toISOString(),
        last_login: new Date(now.getTime() - 8 * 60 * 60_000).toISOString(),
        location: "offline",
    },
];
const currentUser = { id: ownerId, displayName: "Visual Operator", state: "online", status: "online", statusDescription: "VRCX browser port", location: "wrld_00000000-0000-0000-0000-000000000010:12345", world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" } };
const favoriteWorld = { id: "wrld_00000000-0000-0000-0000-000000000051", name: "Favorite Moonlit World", authorName: "Favorite World Author", occupants: 24 };
const favoriteAvatar = { id: "avtr_00000000-0000-0000-0000-000000000052", name: "Favorite Browser Avatar", authorName: "Avatar Artist", releaseStatus: "public" };

await database.collection("app_settings").insertOne({
    _id: "singleton",
    schemaVersion: 1,
    activeUserId: ownerId,
    theme: "dark",
    navigationCollapsed: false,
    myAvatarsView: "grid",
    friendLocationCardScale: 1,
    friendLocationCardSpacing: 1,
    friendLocationShowSameInstance: true,
    friendLocationSegment: "online",
    sidebarGroupByInstance: false,
    sidebarCollapsedSections: [],
    sidebarTab: "friends",
    feedFilters: [],
    feedFavoritesOnly: false,
    friendLogFilters: [],
    activityTablePageSize: 20,
    friendListTablePageSize: 20,
    userDialogLastTab: "Info",
    notificationFilters: [],
    notificationTablePageSize: 20,
    favoriteSortByDate: false,
    favoriteCardScale: { avatar: 1, friend: 1, world: 1 },
    favoriteCardSpacing: { avatar: 1, friend: 1, world: 1 },
    updatedAt: now,
});
await database.collection("vrchat_session").insertOne({ _id: "singleton", schemaVersion: 1, status: "authenticated", activeUserId: ownerId, encryptedCookies: encryptedCookies({ auth: "visual-fixture" }), createdAt: now, updatedAt: now });
await database.collection("monitor_state").insertOne({ _id: "singleton", schemaVersion: 1, ownerId, status: "healthy", pipelineConnected: true, lastPipelineEventAt: now, lastReconciledAt: now, updatedAt: now });
await database.collection("users").insertOne({ _id: `${ownerId}:${ownerId}`, ownerId, userId: ownerId, user: currentUser, source: "auth", observedAt: now, updatedAt: now });
await database.collection("friend_snapshots").insertMany(friends.map((user) => ({ _id: `${ownerId}:${user.id}`, ownerId, friendId: user.id, online: user.state === "online", user, observedAt: now, updatedAt: now })));
await database.collection("favorites").insertMany([
    { _id: `${ownerId}:fvrt_visual_friend`, ownerId, recordId: "fvrt_visual_friend", objectId: friends[0].id, favoriteType: "friend", favorite: { id: "fvrt_visual_friend", favoriteId: friends[0].id, type: "friend", tags: ["group_0"] }, active: true, observedAt: now, updatedAt: now },
    { _id: `${ownerId}:fvrt_visual_world`, ownerId, recordId: "fvrt_visual_world", objectId: favoriteWorld.id, favoriteType: "world", favorite: { id: "fvrt_visual_world", favoriteId: favoriteWorld.id, type: "world", tags: ["worlds1"] }, active: true, observedAt: now, updatedAt: now },
    { _id: `${ownerId}:fvrt_visual_avatar`, ownerId, recordId: "fvrt_visual_avatar", objectId: favoriteAvatar.id, favoriteType: "avatar", favorite: { id: "fvrt_visual_avatar", favoriteId: favoriteAvatar.id, type: "avatar", tags: ["avatars1"] }, active: true, observedAt: now, updatedAt: now },
]);
await database.collection("favorite_groups").insertMany([
    { _id: `${ownerId}:friend:group_0`, ownerId, groupId: "friend:group_0", group: { id: "friend:group_0", name: "group_0", displayName: "Best Friends", type: "friend", visibility: "friends" }, active: true, observedAt: now, updatedAt: now },
    { _id: `${ownerId}:world:worlds1`, ownerId, groupId: "world:worlds1", group: { id: "world:worlds1", name: "worlds1", displayName: "Cozy Worlds", type: "world", visibility: "private" }, active: true, observedAt: now, updatedAt: now },
    { _id: `${ownerId}:avatar:avatars1`, ownerId, groupId: "avatar:avatars1", group: { id: "avatar:avatars1", name: "avatars1", displayName: "Daily Avatars", type: "avatar", visibility: "public" }, active: true, observedAt: now, updatedAt: now },
]);
await database.collection("worlds").insertOne({ _id: `${ownerId}:${favoriteWorld.id}`, ownerId, worldId: favoriteWorld.id, world: favoriteWorld, source: "favorite", observedAt: now, updatedAt: now });
await database.collection("avatars").insertOne({ _id: `${ownerId}:${favoriteAvatar.id}`, ownerId, avatarId: favoriteAvatar.id, avatar: favoriteAvatar, source: "favorite", observedAt: now, updatedAt: now });
const localFriendGroupId = "lfg_00000000-0000-0000-0000-000000000053";
await database.collection("local_favorite_groups").insertOne({ _id: `${ownerId}:${localFriendGroupId}`, ownerId, groupId: localFriendGroupId, kind: "friend", name: "Event Crew", normalizedName: "event crew", createdAt: now, updatedAt: now });
await database.collection("local_favorites").insertOne({ _id: `${ownerId}:${localFriendGroupId}:${friends[1].id}`, ownerId, groupId: localFriendGroupId, kind: "friend", objectId: friends[1].id, item: friends[1], createdAt: now, updatedAt: now });
await database.collection("groups").insertOne({
    _id: `${ownerId}:grp_00000000-0000-0000-0000-000000000020`,
    ownerId,
    groupId: "grp_00000000-0000-0000-0000-000000000020",
    group: { id: "grp_00000000-0000-0000-0000-000000000020", name: "VRCX Test Group", shortCode: "VRCX", memberCount: 128 },
    source: "membership",
    membershipActive: true,
    membershipObservedAt: now,
    observedAt: now,
    updatedAt: now,
});
await database.collection("mutual_graph").insertOne({
    _id: ownerId,
    ownerId,
    relationships: {
        [friends[0].id]: [friends[1].id, friends[2].id],
        [friends[1].id]: [friends[0].id],
        [friends[2].id]: [friends[0].id],
    },
    optedOut: [friends[3].id],
    updatedAt: now,
});
await database.collection("activity_events").insertMany([
    {
        _id: activityId("visual-gps"),
        ownerId,
        type: "GPS",
        subjectUserId: friends[0].id,
        displayName: friends[0].displayName,
        previous: "wrld_00000000-0000-0000-0000-000000000011:54321",
        current: friends[0].location,
        occurredAt: new Date(now.getTime() - 5 * 60_000),
        observedAt: now,
        provenance: "pipeline",
    },
    {
        _id: activityId("visual-status"),
        ownerId,
        type: "Status",
        subjectUserId: friends[1].id,
        displayName: friends[1].displayName,
        previous: "active\nWorking on an avatar",
        current: "ask me\nCome say hello",
        occurredAt: new Date(now.getTime() - 18 * 60_000),
        observedAt: now,
        provenance: "reconciliation",
    },
    {
        _id: activityId("visual-online"),
        ownerId,
        type: "Online",
        subjectUserId: friends[2].id,
        displayName: friends[2].displayName,
        previous: "offline",
        current: "active",
        occurredAt: new Date(now.getTime() - 34 * 60_000),
        observedAt: now,
        provenance: "pipeline",
    },
    {
        _id: activityId("visual-display-name"),
        ownerId,
        type: "DisplayName",
        subjectUserId: friends[1].id,
        displayName: friends[1].displayName,
        previous: "Cobalt User",
        current: friends[1].displayName,
        occurredAt: new Date(now.getTime() - 55 * 60_000),
        observedAt: now,
        provenance: "reconciliation",
    },
    {
        _id: activityId("visual-trust"),
        ownerId,
        type: "TrustLevel",
        subjectUserId: friends[0].id,
        displayName: friends[0].displayName,
        previous: "User",
        current: "Known User",
        occurredAt: new Date(now.getTime() - 70 * 60_000),
        observedAt: now,
        provenance: "reconciliation",
    },
    {
        _id: activityId("visual-unfriend"),
        ownerId,
        type: "Unfriend",
        subjectUserId: "usr_00000000-0000-0000-0000-000000000099",
        displayName: "Former Friend",
        occurredAt: new Date(now.getTime() - 90 * 60_000),
        observedAt: now,
        provenance: "pipeline",
    },
]);
await database.collection("notifications").insertMany([
    {
        _id: `${ownerId}:legacy:not_visual_friend_request`,
        ownerId,
        notificationId: "not_visual_friend_request",
        source: "legacy",
        notification: {
            id: "not_visual_friend_request",
            type: "friendRequest",
            senderUserId: friends[0].id,
            senderUsername: friends[0].displayName,
            message: "Aoi Sample sent you a friend request",
            created_at: new Date(now.getTime() - 4 * 60_000).toISOString(),
            source: "legacy",
        },
        active: true,
        firstObservedAt: new Date(now.getTime() - 4 * 60_000),
        lastObservedAt: new Date(now.getTime() - 4 * 60_000),
        updatedAt: now,
    },
    {
        _id: `${ownerId}:v2:not_visual_group_announcement`,
        ownerId,
        notificationId: "not_visual_group_announcement",
        source: "v2",
        notification: {
            id: "not_visual_group_announcement",
            type: "group.announcement",
            senderUserId: "grp_00000000-0000-0000-0000-000000000020",
            senderUsername: "VRCX Test Group",
            groupName: "VRCX Test Group",
            title: "Group announcement",
            message: "Community meetup starts in one hour.",
            createdAt: new Date(now.getTime() - 21 * 60_000).toISOString(),
            responses: [{ type: "acknowledge", text: "Acknowledge", icon: "check" }],
            source: "v2",
        },
        active: true,
        firstObservedAt: new Date(now.getTime() - 21 * 60_000),
        lastObservedAt: new Date(now.getTime() - 21 * 60_000),
        updatedAt: now,
    },
    {
        _id: `${ownerId}:hidden:not_visual_hidden_message`,
        ownerId,
        notificationId: "not_visual_hidden_message",
        source: "hidden",
        notification: {
            id: "not_visual_hidden_message",
            type: "message",
            senderUserId: friends[1].id,
            senderUsername: friends[1].displayName,
            message: "This dismissed notification remains in local history.",
            created_at: new Date(now.getTime() - 48 * 60_000).toISOString(),
            source: "hidden",
        },
        active: true,
        firstObservedAt: new Date(now.getTime() - 48 * 60_000),
        lastObservedAt: new Date(now.getTime() - 48 * 60_000),
        updatedAt: now,
    },
]);
await database.collection("game_sessions").insertMany([
    {
        _id: "session-current",
        ownerId,
        location: currentUser.location,
        worldId: currentUser.world.id,
        instanceId: "12345",
        worldName: currentUser.world.name,
        startedAt: new Date(now.getTime() - 43 * 60_000),
        startPrecision: "observed",
        startSource: "pipeline",
        firstObservedAt: new Date(now.getTime() - 43 * 60_000),
        lastObservedAt: now,
        current: true,
        updatedAt: now,
    },
    {
        _id: "session-previous",
        ownerId,
        location: "wrld_00000000-0000-0000-0000-000000000011:54321~group(grp_00000000-0000-0000-0000-000000000020)",
        worldId: "wrld_00000000-0000-0000-0000-000000000011",
        instanceId: "54321",
        groupId: "grp_00000000-0000-0000-0000-000000000020",
        worldName: "Midnight Rooftop",
        groupName: "VRCX Test Group",
        startedAt: new Date(now.getTime() - 4 * 60 * 60_000),
        endedAt: new Date(now.getTime() - 2 * 60 * 60_000),
        startPrecision: "observed",
        startSource: "reconciliation",
        endPrecision: "observed",
        endSource: "pipeline",
        firstObservedAt: new Date(now.getTime() - 4 * 60 * 60_000),
        lastObservedAt: new Date(now.getTime() - 2 * 60 * 60_000),
        current: false,
        closeReason: "location-change",
        updatedAt: now,
    },
]);

const child = spawn("pnpm", ["exec", "next", "dev", "-p", port], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DATABASE: databaseName, VRCHAT_SESSION_ENCRYPTION_KEY: encryptionKey.toString("base64"), VRCHAT_COOKIE_SECURE: "false", VRCX_DISABLE_MONITOR: "true" },
    stdio: "inherit",
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child.killed && child.exitCode === null) child.kill(signal);
    await client.close();
    await mongo.stop();
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
child.on("exit", () => void shutdown("SIGTERM"));
