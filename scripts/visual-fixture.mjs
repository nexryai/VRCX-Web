import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";

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

const mongo = await MongoMemoryServer.create();
const client = new MongoClient(mongo.getUri());
await client.connect();
const database = client.db(databaseName);
const now = new Date();
const friends = [
    { id: "usr_00000000-0000-0000-0000-000000000002", displayName: "Aoi Sample", state: "online", status: "join me", statusDescription: "Building a new world", location: "wrld_00000000-0000-0000-0000-000000000010:12345", world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" } },
    { id: "usr_00000000-0000-0000-0000-000000000003", displayName: "Cobalt Friend", state: "online", status: "ask me", statusDescription: "Come say hello", location: "wrld_00000000-0000-0000-0000-000000000010:12345", world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" } },
    { id: "usr_00000000-0000-0000-0000-000000000004", displayName: "Mikan Active", state: "active", status: "active", statusDescription: "Browsing VRChat", location: "offline" },
    { id: "usr_00000000-0000-0000-0000-000000000005", displayName: "Nora Offline", state: "offline", status: "offline", statusDescription: "See you later", location: "offline" },
];
const currentUser = { id: ownerId, displayName: "Visual Operator", state: "online", status: "online", statusDescription: "VRCX browser port", location: "wrld_00000000-0000-0000-0000-000000000010:12345", world: { id: "wrld_00000000-0000-0000-0000-000000000010", name: "The Great Pug" } };

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
    updatedAt: now,
});
await database.collection("vrchat_session").insertOne({ _id: "singleton", schemaVersion: 1, status: "authenticated", activeUserId: ownerId, encryptedCookies: encryptedCookies({ auth: "visual-fixture" }), createdAt: now, updatedAt: now });
await database.collection("monitor_state").insertOne({ _id: "singleton", schemaVersion: 1, ownerId, status: "healthy", pipelineConnected: true, lastPipelineEventAt: now, lastReconciledAt: now, updatedAt: now });
await database.collection("users").insertOne({ _id: `${ownerId}:${ownerId}`, ownerId, userId: ownerId, user: currentUser, source: "auth", observedAt: now, updatedAt: now });
await database.collection("friend_snapshots").insertMany(friends.map((user) => ({ _id: `${ownerId}:${user.id}`, ownerId, friendId: user.id, online: user.state === "online", user, observedAt: now, updatedAt: now })));
await database.collection("favorites").insertOne({ _id: `${ownerId}:fvrt_visual`, ownerId, recordId: "fvrt_visual", objectId: friends[0].id, favoriteType: "friend", favorite: { id: "fvrt_visual", favoriteId: friends[0].id, type: "friend", tags: ["group_0"] }, active: true, observedAt: now, updatedAt: now });
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
