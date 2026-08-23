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
    {
        version: 12,
        name: "add-user-dialog-preference",
        async apply(c) {
            const updatedAt = new Date();
            await c.appSettings.updateMany({ userDialogLastTab: { $exists: false } }, { $set: { userDialogLastTab: "Info", updatedAt } });
        },
    },
    {
        version: 13,
        name: "add-notification-table-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([c.appSettings.updateMany({ notificationFilters: { $exists: false } }, { $set: { notificationFilters: [], updatedAt } }), c.appSettings.updateMany({ notificationTablePageSize: { $exists: false } }, { $set: { notificationTablePageSize: 20, updatedAt } })]);
        },
    },
    {
        version: 14,
        name: "add-local-favorite-groups",
        async apply(c) {
            await Promise.all([
                c.localFavoriteGroups.createIndex({ ownerId: 1, kind: 1, normalizedName: 1 }, { unique: true, name: "owner_kind_name_unique" }),
                c.localFavoriteGroups.createIndex({ ownerId: 1, kind: 1, createdAt: 1 }, { name: "owner_kind_created" }),
                c.localFavorites.createIndex({ ownerId: 1, groupId: 1, objectId: 1 }, { unique: true, name: "owner_group_object_unique" }),
                c.localFavorites.createIndex({ ownerId: 1, groupId: 1, updatedAt: -1 }, { name: "owner_group_updated" }),
            ]);
        },
    },
    {
        version: 15,
        name: "add-favorites-layout-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ favoriteSortByDate: { $exists: false } }, { $set: { favoriteSortByDate: false, updatedAt } }),
                c.appSettings.updateMany({ favoriteCardScale: { $exists: false } }, { $set: { favoriteCardScale: { avatar: 1, friend: 1, world: 1 }, updatedAt } }),
                c.appSettings.updateMany({ favoriteCardSpacing: { $exists: false } }, { $set: { favoriteCardSpacing: { avatar: 1, friend: 1, world: 1 }, updatedAt } }),
            ]);
        },
    },
    {
        version: 16,
        name: "add-moderation-table-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([c.appSettings.updateMany({ moderationFilters: { $exists: false } }, { $set: { moderationFilters: [], updatedAt } }), c.appSettings.updateMany({ moderationTablePageSize: { $exists: false } }, { $set: { moderationTablePageSize: 20, updatedAt } })]);
        },
    },
    {
        version: 17,
        name: "add-avatar-tags-and-layout-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.avatarTags.createIndex({ ownerId: 1, avatarId: 1, normalizedTag: 1 }, { unique: true, name: "owner_avatar_tag_unique" }),
                c.avatarTags.createIndex({ ownerId: 1, normalizedTag: 1 }, { name: "owner_tag_lookup" }),
                c.appSettings.updateMany({ myAvatarsCardScale: { $exists: false } }, { $set: { myAvatarsCardScale: 0.6, updatedAt } }),
                c.appSettings.updateMany({ myAvatarsCardSpacing: { $exists: false } }, { $set: { myAvatarsCardSpacing: 1, updatedAt } }),
                c.appSettings.updateMany({ myAvatarsTablePageSize: { $exists: false } }, { $set: { myAvatarsTablePageSize: 20, updatedAt } }),
            ]);
        },
    },
    {
        version: 18,
        name: "add-mutual-graph-job-state",
        async apply(c) {
            await c.mutualGraph.updateMany({ jobStatus: { $exists: false } }, { $set: { jobStatus: "complete", jobProcessed: 0, jobTotal: 0, jobCancelRequested: false } });
        },
    },
    {
        version: 19,
        name: "add-mutual-graph-layout-preferences",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ mutualGraphLayoutIterations: { $exists: false } }, { $set: { mutualGraphLayoutIterations: 800, updatedAt } }),
                c.appSettings.updateMany({ mutualGraphLayoutSpacing: { $exists: false } }, { $set: { mutualGraphLayoutSpacing: 60, updatedAt } }),
                c.appSettings.updateMany({ mutualGraphEdgeCurvature: { $exists: false } }, { $set: { mutualGraphEdgeCurvature: 0.1, updatedAt } }),
                c.appSettings.updateMany({ mutualGraphCommunitySeparation: { $exists: false } }, { $set: { mutualGraphCommunitySeparation: 0, updatedAt } }),
                c.appSettings.updateMany({ mutualGraphExcludedFriendIds: { $exists: false } }, { $set: { mutualGraphExcludedFriendIds: [], updatedAt } }),
            ]);
        },
    },
    {
        version: 20,
        name: "add-group-dialog-cache-indexes",
        async apply(c) {
            await Promise.all([
                c.groupPosts.createIndex({ ownerId: 1, groupId: 1, postId: 1 }, { unique: true, name: "owner_group_post_unique" }),
                c.groupPosts.createIndex({ ownerId: 1, groupId: 1, active: 1, "post.updatedAt": -1 }, { name: "owner_group_active_updated" }),
                c.groupMembers.createIndex({ ownerId: 1, groupId: 1, userId: 1 }, { unique: true, name: "owner_group_user_unique" }),
                c.groupMembers.createIndex({ ownerId: 1, groupId: 1, active: 1, "member.joinedAt": -1 }, { name: "owner_group_active_joined" }),
            ]);
        },
    },
    {
        version: 21,
        name: "add-entity-memo-indexes",
        async apply(c) {
            await Promise.all([c.entityMemos.createIndex({ ownerId: 1, entityType: 1, entityId: 1 }, { unique: true, name: "owner_type_entity_unique" }), c.entityMemos.createIndex({ ownerId: 1, entityType: 1, updatedAt: -1 }, { name: "owner_type_updated" })]);
        },
    },
    {
        version: 22,
        name: "add-monitor-pipeline-cursor",
        async apply(c) {
            await c.monitorState.updateOne({ _id: "singleton", pipelineSequence: { $exists: false } }, { $set: { pipelineSequence: 0, updatedAt: new Date() } });
        },
    },
    {
        version: 23,
        name: "add-avatar-feed-retention",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([c.activityEvents.createIndex({ ownerId: 1, type: 1, occurredAt: 1 }, { name: "owner_type_occurred" }), c.appSettings.updateMany({ avatarAutoCleanupDays: { $exists: false } }, { $set: { avatarAutoCleanupDays: 0, updatedAt } })]);
        },
    },
    {
        version: 24,
        name: "add-self-activity-snapshots",
        async apply(c) {
            await c.selfSnapshots.createIndex({ ownerId: 1 }, { unique: true, name: "owner_unique" });
        },
    },
    {
        version: 25,
        name: "add-legacy-browser-settings-import-state",
        async apply(c) {
            await c.appSettings.updateMany({ legacyBrowserSettingsImportVersion: { $exists: false } }, { $set: { legacyBrowserSettingsImportVersion: 0, updatedAt: new Date() } });
        },
    },
    {
        version: 26,
        name: "add-previous-instance-query-indexes",
        async apply(c) {
            await Promise.all([c.gameSessions.createIndex({ ownerId: 1, worldId: 1, startedAt: -1 }, { name: "owner_world_started" }), c.gameSessions.createIndex({ ownerId: 1, groupId: 1, startedAt: -1 }, { name: "owner_group_started" })]);
        },
    },
    {
        version: 27,
        name: "add-mutual-graph-resume-checkpoints",
        async apply(c) {
            // Jobs created before checkpoint support cannot truthfully resume
            // from jobProcessed because their partial graph was never durable.
            await c.mutualGraph.updateMany(
                { jobStatus: "running", jobFriendIds: { $exists: false } },
                {
                    $set: {
                        jobStatus: "error",
                        jobError: "The interrupted Mutual Friends fetch predates resumable checkpoints. Start it again.",
                        jobCancelRequested: false,
                        jobHeartbeatAt: new Date(),
                    },
                },
            );
        },
    },
    {
        version: 28,
        name: "add-group-instance-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupInstanceSnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupInstanceSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 29,
        name: "add-group-calendar-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupCalendarSnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupCalendarSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 30,
        name: "add-group-gallery-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupGallerySnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupGallerySnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 31,
        name: "add-group-post-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupPostSnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupPostSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 32,
        name: "add-personal-file-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.personalFileSnapshots.createIndex({ ownerId: 1, tag: 1 }, { unique: true, name: "owner_tag_unique" }), c.personalFileSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 33,
        name: "add-group-ban-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupBanSnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupBanSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 34,
        name: "add-group-invite-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupInviteSnapshots.createIndex({ ownerId: 1, groupId: 1 }, { unique: true, name: "owner_group_unique" }), c.groupInviteSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 35,
        name: "add-group-audit-log-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.groupAuditLogSnapshots.createIndex({ ownerId: 1, groupId: 1, filterKey: 1 }, { unique: true, name: "owner_group_filter_unique" }), c.groupAuditLogSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 36,
        name: "add-avatar-moderation-projection-indexes",
        async apply(c) {
            await Promise.all([c.avatarModerations.createIndex({ ownerId: 1, targetAvatarId: 1, moderationType: 1 }, { unique: true, name: "owner_target_type_unique" }), c.avatarModerations.createIndex({ ownerId: 1, active: 1, updatedAt: -1 }, { name: "owner_active_updated" })]);
        },
    },
    {
        version: 37,
        name: "add-avatar-gallery-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.avatarGallerySnapshots.createIndex({ ownerId: 1, avatarId: 1 }, { unique: true, name: "owner_avatar_unique" }), c.avatarGallerySnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 38,
        name: "add-avatar-style-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.avatarStyleSnapshots.createIndex({ ownerId: 1 }, { unique: true, name: "owner_unique" }), c.avatarStyleSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 39,
        name: "add-world-persist-snapshot-indexes",
        async apply(c) {
            await Promise.all([c.worldPersistSnapshots.createIndex({ ownerId: 1, worldId: 1 }, { unique: true, name: "owner_world_unique" }), c.worldPersistSnapshots.createIndex({ ownerId: 1, observedAt: -1 }, { name: "owner_observed" })]);
        },
    },
    {
        version: 40,
        name: "add-social-favorite-group-filter",
        async apply(c) {
            await c.appSettings.updateMany({ localFavoriteFriendsGroups: { $exists: false } }, { $set: { localFavoriteFriendsGroups: [], updatedAt: new Date() } });
        },
    },
    {
        version: 41,
        name: "add-recent-social-actions",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([
                c.appSettings.updateMany({ recentActionCooldownEnabled: { $exists: false } }, { $set: { recentActionCooldownEnabled: false, updatedAt } }),
                c.appSettings.updateMany({ recentActionCooldownMinutes: { $exists: false } }, { $set: { recentActionCooldownMinutes: 60, updatedAt } }),
                c.recentActions.createIndex({ ownerId: 1, userId: 1, action: 1 }, { unique: true, name: "owner_user_action_unique" }),
                c.recentActions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expires_at_ttl" }),
            ]);
        },
    },
    {
        version: 42,
        name: "add-browser-notification-delivery",
        async apply(c) {
            const updatedAt = new Date();
            await Promise.all([c.appSettings.updateMany({ browserNotificationsEnabled: { $exists: false } }, { $set: { browserNotificationsEnabled: false, updatedAt } }), c.notifications.createIndex({ ownerId: 1, source: 1, browserDeliveredAt: 1, firstObservedAt: 1 }, { name: "owner_browser_delivery" })]);
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
