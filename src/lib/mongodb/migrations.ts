import "server-only";

import { getMongoDatabase } from "./client";
import { collections } from "./collections";

type MigrationGlobal = typeof globalThis & {
    __vrcxMongoMigrationPromise?: Promise<void>;
};

const migrationGlobal = globalThis as MigrationGlobal;

async function applyIndexes() {
    const db = await getMongoDatabase();
    const c = collections(db);

    await Promise.all([
        c.friendSnapshots.createIndex({ ownerId: 1, friendId: 1 }, { unique: true, name: "owner_friend_unique" }),
        c.friendSnapshots.createIndex({ ownerId: 1, online: 1, "user.displayName": 1 }, { name: "owner_online_name" }),
        c.activityEvents.createIndex({ ownerId: 1, occurredAt: -1 }, { name: "owner_occurred" }),
        c.activityEvents.createIndex({ ownerId: 1, subjectUserId: 1, occurredAt: -1 }, { name: "owner_subject_occurred" }),
        c.gameSessions.createIndex({ ownerId: 1, startedAt: -1 }, { name: "owner_started" }),
        c.gameSessions.createIndex({ ownerId: 1, location: 1, startedAt: -1 }, { name: "owner_location_started" }),
        c.gameSessions.createIndex(
            { ownerId: 1, current: 1 },
            {
                unique: true,
                partialFilterExpression: { current: true },
                name: "one_open_session_per_owner",
            },
        ),
        c.notifications.createIndex({ ownerId: 1, source: 1, notificationId: 1 }, { unique: true, name: "owner_source_notification_unique" }),
        c.notifications.createIndex({ ownerId: 1, source: 1, active: 1, lastObservedAt: -1 }, { name: "owner_source_active_observed" }),
        c.mutualGraph.createIndex({ ownerId: 1 }, { unique: true, name: "owner_unique" }),
        c.monitorState.createIndex({ leaseExpiresAt: 1 }, { name: "leader_lease_expiry" }),
    ]);

    const now = new Date();
    await c.appSettings.updateOne(
        { _id: "singleton" },
        {
            $setOnInsert: {
                schemaVersion: 1,
                theme: "dark",
                navigationCollapsed: false,
                myAvatarsView: "grid",
                updatedAt: now,
            },
        },
        { upsert: true },
    );
    await c.monitorState.updateOne(
        { _id: "singleton" },
        {
            $setOnInsert: {
                schemaVersion: 1,
                status: "idle",
                pipelineConnected: false,
                updatedAt: now,
            },
        },
        { upsert: true },
    );
    await c.gameSessions.updateMany({ startSource: { $exists: false } }, { $set: { startSource: "reconciliation" } });
}

export async function ensureMongoSchema(): Promise<void> {
    migrationGlobal.__vrcxMongoMigrationPromise ??= applyIndexes();
    try {
        await migrationGlobal.__vrcxMongoMigrationPromise;
    } catch (error) {
        migrationGlobal.__vrcxMongoMigrationPromise = undefined;
        throw error;
    }
}
