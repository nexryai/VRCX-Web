import "server-only";

import { getMongoDatabase } from "./client";
import type { Collections } from "./collections";
import { collections } from "./collections";

type MigrationGlobal = typeof globalThis & {
    __vrcxMongoMigrationPromise?: Promise<void>;
};

type Migration = {
    version: number;
    name: string;
    apply: (collections: Collections) => Promise<void>;
};

const migrationGlobal = globalThis as MigrationGlobal;

const migrations: Migration[] = [
    {
        version: 1,
        name: "create-core-collections-and-indexes",
        async apply(c) {
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
        },
    },
    {
        version: 2,
        name: "backfill-settings-and-game-session-provenance",
        async apply(c) {
            const now = new Date();
            await Promise.all([
                c.appSettings.updateOne(
                    { _id: "singleton" },
                    {
                        $set: { schemaVersion: 1 },
                        $setOnInsert: { updatedAt: now },
                    },
                    { upsert: true },
                ),
                c.appSettings.updateMany({ theme: { $exists: false } }, { $set: { theme: "dark", updatedAt: now } }),
                c.appSettings.updateMany({ navigationCollapsed: { $exists: false } }, { $set: { navigationCollapsed: false, updatedAt: now } }),
                c.appSettings.updateMany({ myAvatarsView: { $exists: false } }, { $set: { myAvatarsView: "grid", updatedAt: now } }),
                c.gameSessions.updateMany({ startSource: { $exists: false } }, { $set: { startSource: "reconciliation" } }),
            ]);
        },
    },
];

async function applyMigrations() {
    const c = collections(await getMongoDatabase());
    for (const migration of migrations) {
        const applied = await c.schemaMigrations.findOne({ _id: migration.version });
        if (applied) continue;
        // Every migration is idempotent because multiple Next.js processes may
        // reach startup together before the migration marker is written.
        await migration.apply(c);
        await c.schemaMigrations.updateOne({ _id: migration.version }, { $setOnInsert: { name: migration.name, appliedAt: new Date() } }, { upsert: true });
    }
}

export async function ensureMongoSchema(): Promise<void> {
    migrationGlobal.__vrcxMongoMigrationPromise ??= applyMigrations();
    try {
        await migrationGlobal.__vrcxMongoMigrationPromise;
    } catch (error) {
        migrationGlobal.__vrcxMongoMigrationPromise = undefined;
        throw error;
    }
}
