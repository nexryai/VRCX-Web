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
                        friendLocationCardScale: 1,
                        friendLocationCardSpacing: 1,
                        friendLocationShowSameInstance: false,
                        friendLocationSegment: "online",
                        sidebarGroupByInstance: false,
                        sidebarCollapsedSections: [],
                        sidebarTab: "friends",
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
    {
        version: 3,
        name: "add-user-cache-indexes",
        async apply(c) {
            await Promise.all([c.users.createIndex({ ownerId: 1, userId: 1 }, { unique: true, name: "owner_user_unique" }), c.users.createIndex({ ownerId: 1, "user.displayName": 1 }, { name: "owner_display_name" }), c.users.createIndex({ ownerId: 1, updatedAt: -1 }, { name: "owner_updated" })]);
        },
    },
    {
        version: 4,
        name: "add-remote-entity-cache-indexes",
        async apply(c) {
            await Promise.all([
                c.worlds.createIndex({ ownerId: 1, worldId: 1 }, { unique: true, name: "owner_world_unique" }),
                c.worlds.createIndex({ ownerId: 1, "world.name": 1 }, { name: "owner_world_name" }),
                c.groups.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }),
                c.groups.createIndex({ ownerId: 1, "group.name": 1 }, { name: "owner_group_name" }),
                c.avatars.createIndex({ ownerId: 1, avatarId: 1 }, { unique: true, name: "owner_avatar_unique" }),
                c.avatars.createIndex({ ownerId: 1, "avatar.name": 1 }, { name: "owner_avatar_name" }),
            ]);
        },
    },
    {
        version: 5,
        name: "add-favorite-and-moderation-projection-indexes",
        async apply(c) {
            await Promise.all([
                c.favorites.createIndex({ ownerId: 1, recordId: 1 }, { unique: true, name: "owner_record_unique" }),
                c.favorites.createIndex({ ownerId: 1, favoriteType: 1, active: 1, updatedAt: -1 }, { name: "owner_type_active_updated" }),
                c.favoriteGroups.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }),
                c.favoriteGroups.createIndex({ ownerId: 1, active: 1, "group.type": 1 }, { name: "owner_active_type" }),
                c.moderations.createIndex({ ownerId: 1, targetUserId: 1, moderationType: 1 }, { unique: true, name: "owner_target_type_unique" }),
                c.moderations.createIndex({ ownerId: 1, active: 1, updatedAt: -1 }, { name: "owner_active_updated" }),
            ]);
        },
    },
    {
        version: 6,
        name: "add-friends-locations-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ friendLocationCardScale: { $exists: false } }, { $set: { friendLocationCardScale: 1, updatedAt } }),
                c.appSettings.updateMany({ friendLocationCardSpacing: { $exists: false } }, { $set: { friendLocationCardSpacing: 1, updatedAt } }),
                c.appSettings.updateMany({ friendLocationShowSameInstance: { $exists: false } }, { $set: { friendLocationShowSameInstance: false, updatedAt } }),
                c.appSettings.updateMany({ friendLocationSegment: { $exists: false } }, { $set: { friendLocationSegment: "online", updatedAt } }),
            ]);
        },
    },
    {
        version: 7,
        name: "add-reconciliation-lease-index",
        async apply(c) {
            await c.monitorState.createIndex({ reconciliationLeaseExpiresAt: 1 }, { name: "reconciliation_lease_expiry" });
        },
    },
    {
        version: 8,
        name: "add-group-membership-index",
        async apply(c) {
            await c.groups.createIndex({ ownerId: 1, membershipActive: 1, "group.name": 1 }, { name: "owner_membership_name" });
        },
    },
    {
        version: 9,
        name: "add-sidebar-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ sidebarGroupByInstance: { $exists: false } }, { $set: { sidebarGroupByInstance: false, updatedAt } }),
                c.appSettings.updateMany({ sidebarCollapsedSections: { $exists: false } }, { $set: { sidebarCollapsedSections: [], updatedAt } }),
                c.appSettings.updateMany({ sidebarTab: { $exists: false } }, { $set: { sidebarTab: "friends", updatedAt } }),
            ]);
        },
    },
    {
        version: 10,
        name: "add-activity-table-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ feedFilters: { $exists: false } }, { $set: { feedFilters: [], updatedAt } }),
                c.appSettings.updateMany({ feedFavoritesOnly: { $exists: false } }, { $set: { feedFavoritesOnly: false, updatedAt } }),
                c.appSettings.updateMany({ friendLogFilters: { $exists: false } }, { $set: { friendLogFilters: [], updatedAt } }),
                c.appSettings.updateMany({ activityTablePageSize: { $exists: false } }, { $set: { activityTablePageSize: 20, updatedAt } }),
            ]);
        },
    },
    {
        version: 11,
        name: "add-friend-list-table-preference",
        async apply(c) {
            const updatedAt = new Date();
            await c.appSettings.updateMany({ friendListTablePageSize: { $exists: false } }, { $set: { friendListTablePageSize: 20, updatedAt } });
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
