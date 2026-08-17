import "server-only";

import type { Collection, Db } from "mongodb";

import type { LegacyBrowserStorageKey } from "@/lib/legacy-browser-settings";
import type {
    VrchatAvatar,
    VrchatAvatarModeration,
    VrchatFavorite,
    VrchatFavoriteGroup,
    VrchatFile,
    VrchatGroup,
    VrchatGroupAuditLog,
    VrchatGroupCalendarEvent,
    VrchatGroupGallery,
    VrchatGroupGalleryImage,
    VrchatGroupInstance,
    VrchatGroupMember,
    VrchatGroupPost,
    VrchatNotification,
    VrchatPlayerModeration,
    VrchatUser,
    VrchatWorld,
} from "@/lib/vrchat/types";

export type EncryptedValue = {
    algorithm: "aes-256-gcm";
    iv: string;
    tag: string;
    ciphertext: string;
};

export type VrchatSessionDocument = {
    _id: "singleton";
    schemaVersion: 1;
    status: "pending-two-factor" | "authenticated";
    activeUserId?: string;
    encryptedCookies: EncryptedValue;
    createdAt: Date;
    updatedAt: Date;
};

export type AppSettingsDocument = {
    _id: "singleton";
    schemaVersion: 1;
    activeUserId?: string;
    theme: "dark" | "light";
    navigationCollapsed: boolean;
    myAvatarsView: "grid" | "table";
    myAvatarsCardScale: number;
    myAvatarsCardSpacing: number;
    myAvatarsTablePageSize: 20 | 50 | 100;
    friendLocationCardScale: number;
    friendLocationCardSpacing: number;
    friendLocationShowSameInstance: boolean;
    friendLocationSegment: "active" | "favorite" | "offline" | "online" | "same-instance";
    sidebarGroupByInstance: boolean;
    sidebarCollapsedSections: Array<"active" | "favorite" | "me" | "offline" | "online">;
    sidebarTab: "friends" | "groups";
    feedFilters: Array<"GPS" | "Online" | "Offline" | "Status" | "Avatar" | "Bio">;
    feedFavoritesOnly: boolean;
    friendLogFilters: Array<"Friend" | "Unfriend" | "FriendRequest" | "DisplayName" | "TrustLevel">;
    activityTablePageSize: 20 | 50 | 100;
    friendListTablePageSize: 20 | 50 | 100;
    userDialogLastTab: "Info" | "Mutual" | "Groups" | "Worlds" | "Activity" | "JSON";
    notificationFilters: string[];
    notificationTablePageSize: 20 | 50 | 100;
    favoriteSortByDate: boolean;
    favoriteCardScale: Record<"avatar" | "friend" | "world", number>;
    favoriteCardSpacing: Record<"avatar" | "friend" | "world", number>;
    moderationFilters: string[];
    moderationTablePageSize: 20 | 50 | 100;
    mutualGraphLayoutIterations: number;
    mutualGraphLayoutSpacing: number;
    mutualGraphEdgeCurvature: number;
    mutualGraphCommunitySeparation: number;
    mutualGraphExcludedFriendIds: string[];
    avatarAutoCleanupDays: 0 | 30 | 90 | 180 | 365;
    legacyBrowserSettingsImportVersion: 0 | 1;
    legacyBrowserSettingsImportedAt?: Date;
    legacyBrowserSettingsImportedKeys?: LegacyBrowserStorageKey[];
    updatedAt: Date;
};

export type MonitorStateDocument = {
    _id: "singleton";
    schemaVersion: 1;
    ownerId?: string;
    leaderId?: string;
    leaseExpiresAt?: Date;
    reconciliationLeaseOwner?: string;
    reconciliationLeaseExpiresAt?: Date;
    status: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error";
    pipelineConnected: boolean;
    pipelineSequence: number;
    lastPipelineEventKey?: string;
    lastPipelineEventType?: string;
    lastPipelineEventAt?: Date;
    lastReconciledAt?: Date;
    lastAvatarCleanupAt?: Date;
    lastAvatarAutoCleanupAt?: Date;
    lastAvatarCleanupDeleted?: number;
    lastAvatarCleanupError?: string;
    lastError?: string;
    updatedAt: Date;
};

export type FriendSnapshotDocument = {
    _id: string;
    ownerId: string;
    friendId: string;
    online: boolean;
    user: VrchatUser;
    observedAt: Date;
    updatedAt: Date;
};

export type SelfSnapshotDocument = {
    _id: string;
    ownerId: string;
    userId: string;
    online: boolean;
    user: VrchatUser;
    observedAt: Date;
    updatedAt: Date;
};

export type UserDocument = {
    _id: string;
    ownerId: string;
    userId: string;
    user: VrchatUser;
    source: "auth" | "friends" | "lookup" | "pipeline" | "search";
    observedAt: Date;
    updatedAt: Date;
};

export type WorldDocument = {
    _id: string;
    ownerId: string;
    worldId: string;
    world: VrchatWorld;
    source: "favorite" | "lookup" | "search" | "session";
    observedAt: Date;
    updatedAt: Date;
};

export type GroupDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    group: VrchatGroup;
    source: "lookup" | "membership" | "search" | "session";
    membershipActive?: boolean;
    membershipObservedAt?: Date;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupPostDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    postId: string;
    post: VrchatGroupPost;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupPostSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    observedAt: Date;
    updatedAt: Date;
};

export type PersonalFileSnapshotDocument = {
    _id: string;
    ownerId: string;
    tag: "gallery";
    files: VrchatFile[];
    observedAt: Date;
    updatedAt: Date;
};

export type AvatarGallerySnapshotDocument = {
    _id: string;
    ownerId: string;
    avatarId: string;
    authorId: string;
    files: VrchatFile[];
    observedAt: Date;
    updatedAt: Date;
};

export type GroupMemberDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    userId: string;
    member: VrchatGroupMember;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupBanSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    bans: VrchatGroupMember[];
    observedAt: Date;
    updatedAt: Date;
};

export type GroupInviteSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    invites: VrchatGroupMember[];
    joinRequests: VrchatGroupMember[];
    blockedRequests: VrchatGroupMember[];
    observedAt: Date;
    updatedAt: Date;
};

export type GroupAuditLogSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    filterKey: string;
    eventTypes: string[];
    availableEventTypes: string[];
    logs: VrchatGroupAuditLog[];
    truncated: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupInstanceSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    instances: VrchatGroupInstance[];
    upstreamFetchedAt?: string;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupCalendarSnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    events: VrchatGroupCalendarEvent[];
    hasNext: boolean;
    totalCount: number;
    observedAt: Date;
    updatedAt: Date;
};

export type GroupGallerySnapshotDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    galleries: VrchatGroupGallery[];
    images: VrchatGroupGalleryImage[];
    truncatedGalleryIds: string[];
    observedAt: Date;
    updatedAt: Date;
};

export type AvatarDocument = {
    _id: string;
    ownerId: string;
    avatarId: string;
    avatar: VrchatAvatar;
    source: "favorite" | "lookup" | "owned" | "search";
    observedAt: Date;
    updatedAt: Date;
};

export type AvatarTagDocument = {
    _id: string;
    ownerId: string;
    avatarId: string;
    tag: string;
    normalizedTag: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type EntityMemoDocument = {
    _id: string;
    ownerId: string;
    entityType: "avatar" | "user" | "world";
    entityId: string;
    memo: string;
    createdAt: Date;
    updatedAt: Date;
};

export type ActivityEventDocument = {
    _id: string;
    ownerId: string;
    type: "Avatar" | "Bio" | "DisplayName" | "Friend" | "FriendRequest" | "GPS" | "Offline" | "Online" | "Status" | "TrustLevel" | "Unfriend";
    subjectUserId: string;
    displayName: string;
    previous?: string;
    current?: string;
    previousSnapshotObservedAt?: Date;
    occurredAt: Date;
    observedAt: Date;
    provenance: "pipeline" | "reconciliation";
};

export type GameSessionDocument = {
    _id: string;
    ownerId: string;
    location: string;
    worldId?: string;
    instanceId?: string;
    worldName?: string;
    groupId?: string;
    groupName?: string;
    startedAt: Date;
    endedAt?: Date;
    startPrecision: "upstream" | "observed";
    startSource: "pipeline" | "reconciliation";
    endPrecision?: "upstream" | "observed";
    endSource?: "pipeline" | "reconciliation";
    firstObservedAt: Date;
    lastObservedAt: Date;
    current: boolean;
    closeReason?: "location-change" | "offline" | "private" | "unobservable" | "identity-change";
    updatedAt: Date;
};

export type MutualGraphDocument = {
    _id: string;
    ownerId: string;
    relationships: Record<string, string[]>;
    optedOut: string[];
    jobId?: string;
    jobStatus?: "cancelled" | "complete" | "error" | "running";
    jobProcessed?: number;
    jobTotal?: number;
    jobCancelRequested?: boolean;
    jobError?: string;
    jobHeartbeatAt?: Date;
    jobTargetFriendId?: string;
    jobFriendIds?: string[];
    jobRelationships?: Record<string, string[]>;
    jobOptedOut?: string[];
    updatedAt: Date;
};

export type NotificationDocument = {
    _id: string;
    ownerId: string;
    notificationId: string;
    source: "hidden" | "legacy" | "v2";
    notification: VrchatNotification;
    active: boolean;
    firstObservedAt: Date;
    lastObservedAt: Date;
    updatedAt: Date;
};

export type FavoriteDocument = {
    _id: string;
    ownerId: string;
    recordId: string;
    objectId: string;
    favoriteType: string;
    favorite: VrchatFavorite;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type FavoriteGroupDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    group: VrchatFavoriteGroup;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type LocalFavoriteKind = "avatar" | "friend" | "world";

export type LocalFavoriteGroupDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    kind: LocalFavoriteKind;
    name: string;
    normalizedName: string;
    createdAt: Date;
    updatedAt: Date;
};

export type LocalFavoriteDocument = {
    _id: string;
    ownerId: string;
    groupId: string;
    kind: LocalFavoriteKind;
    objectId: string;
    item: VrchatAvatar | VrchatUser | VrchatWorld;
    createdAt: Date;
    updatedAt: Date;
};

export type ModerationDocument = {
    _id: string;
    ownerId: string;
    targetUserId: string;
    moderationType: string;
    moderation: VrchatPlayerModeration;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type AvatarModerationDocument = {
    _id: string;
    ownerId: string;
    targetAvatarId: string;
    moderationType: "block";
    moderation: VrchatAvatarModeration;
    active: boolean;
    observedAt: Date;
    updatedAt: Date;
};

export type SchemaMigrationDocument = {
    _id: number;
    name: string;
    appliedAt: Date;
};

export type Collections = {
    appSettings: Collection<AppSettingsDocument>;
    vrchatSession: Collection<VrchatSessionDocument>;
    monitorState: Collection<MonitorStateDocument>;
    users: Collection<UserDocument>;
    worlds: Collection<WorldDocument>;
    groups: Collection<GroupDocument>;
    groupPosts: Collection<GroupPostDocument>;
    groupPostSnapshots: Collection<GroupPostSnapshotDocument>;
    personalFileSnapshots: Collection<PersonalFileSnapshotDocument>;
    avatarGallerySnapshots: Collection<AvatarGallerySnapshotDocument>;
    groupMembers: Collection<GroupMemberDocument>;
    groupBanSnapshots: Collection<GroupBanSnapshotDocument>;
    groupInviteSnapshots: Collection<GroupInviteSnapshotDocument>;
    groupAuditLogSnapshots: Collection<GroupAuditLogSnapshotDocument>;
    groupInstanceSnapshots: Collection<GroupInstanceSnapshotDocument>;
    groupCalendarSnapshots: Collection<GroupCalendarSnapshotDocument>;
    groupGallerySnapshots: Collection<GroupGallerySnapshotDocument>;
    avatars: Collection<AvatarDocument>;
    avatarTags: Collection<AvatarTagDocument>;
    entityMemos: Collection<EntityMemoDocument>;
    friendSnapshots: Collection<FriendSnapshotDocument>;
    selfSnapshots: Collection<SelfSnapshotDocument>;
    activityEvents: Collection<ActivityEventDocument>;
    gameSessions: Collection<GameSessionDocument>;
    notifications: Collection<NotificationDocument>;
    favorites: Collection<FavoriteDocument>;
    favoriteGroups: Collection<FavoriteGroupDocument>;
    localFavoriteGroups: Collection<LocalFavoriteGroupDocument>;
    localFavorites: Collection<LocalFavoriteDocument>;
    moderations: Collection<ModerationDocument>;
    avatarModerations: Collection<AvatarModerationDocument>;
    schemaMigrations: Collection<SchemaMigrationDocument>;
    mutualGraph: Collection<MutualGraphDocument>;
};

export function collections(db: Db): Collections {
    return {
        appSettings: db.collection<AppSettingsDocument>("app_settings"),
        vrchatSession: db.collection<VrchatSessionDocument>("vrchat_session"),
        monitorState: db.collection<MonitorStateDocument>("monitor_state"),
        users: db.collection<UserDocument>("users"),
        worlds: db.collection<WorldDocument>("worlds"),
        groups: db.collection<GroupDocument>("groups"),
        groupPosts: db.collection<GroupPostDocument>("group_posts"),
        groupPostSnapshots: db.collection<GroupPostSnapshotDocument>("group_post_snapshots"),
        personalFileSnapshots: db.collection<PersonalFileSnapshotDocument>("personal_file_snapshots"),
        avatarGallerySnapshots: db.collection<AvatarGallerySnapshotDocument>("avatar_gallery_snapshots"),
        groupMembers: db.collection<GroupMemberDocument>("group_members"),
        groupBanSnapshots: db.collection<GroupBanSnapshotDocument>("group_ban_snapshots"),
        groupInviteSnapshots: db.collection<GroupInviteSnapshotDocument>("group_invite_snapshots"),
        groupAuditLogSnapshots: db.collection<GroupAuditLogSnapshotDocument>("group_audit_log_snapshots"),
        groupInstanceSnapshots: db.collection<GroupInstanceSnapshotDocument>("group_instance_snapshots"),
        groupCalendarSnapshots: db.collection<GroupCalendarSnapshotDocument>("group_calendar_snapshots"),
        groupGallerySnapshots: db.collection<GroupGallerySnapshotDocument>("group_gallery_snapshots"),
        avatars: db.collection<AvatarDocument>("avatars"),
        avatarTags: db.collection<AvatarTagDocument>("avatar_tags"),
        entityMemos: db.collection<EntityMemoDocument>("entity_memos"),
        friendSnapshots: db.collection<FriendSnapshotDocument>("friend_snapshots"),
        selfSnapshots: db.collection<SelfSnapshotDocument>("self_snapshots"),
        activityEvents: db.collection<ActivityEventDocument>("activity_events"),
        gameSessions: db.collection<GameSessionDocument>("game_sessions"),
        notifications: db.collection<NotificationDocument>("notifications"),
        favorites: db.collection<FavoriteDocument>("favorites"),
        favoriteGroups: db.collection<FavoriteGroupDocument>("favorite_groups"),
        localFavoriteGroups: db.collection<LocalFavoriteGroupDocument>("local_favorite_groups"),
        localFavorites: db.collection<LocalFavoriteDocument>("local_favorites"),
        moderations: db.collection<ModerationDocument>("moderations"),
        avatarModerations: db.collection<AvatarModerationDocument>("avatar_moderations"),
        schemaMigrations: db.collection<SchemaMigrationDocument>("schema_migrations"),
        mutualGraph: db.collection<MutualGraphDocument>("mutual_graph"),
    };
}
