import "server-only";

import type { Collection, Db } from "mongodb";

import type { VrchatAvatar, VrchatFavorite, VrchatFavoriteGroup, VrchatGroup, VrchatNotification, VrchatPlayerModeration, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";

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
    friendLocationCardScale: number;
    friendLocationCardSpacing: number;
    friendLocationShowSameInstance: boolean;
    friendLocationSegment: "active" | "favorite" | "offline" | "online" | "same-instance";
    updatedAt: Date;
};

export type MonitorStateDocument = {
    _id: "singleton";
    schemaVersion: 1;
    ownerId?: string;
    leaderId?: string;
    leaseExpiresAt?: Date;
    status: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error";
    pipelineConnected: boolean;
    lastPipelineEventAt?: Date;
    lastReconciledAt?: Date;
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
    source: "lookup" | "search" | "session";
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

export type ActivityEventDocument = {
    _id: string;
    ownerId: string;
    type: "Avatar" | "Bio" | "DisplayName" | "Friend" | "GPS" | "Offline" | "Online" | "Status" | "Unfriend";
    subjectUserId: string;
    displayName: string;
    previous?: string;
    current?: string;
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
    avatars: Collection<AvatarDocument>;
    friendSnapshots: Collection<FriendSnapshotDocument>;
    activityEvents: Collection<ActivityEventDocument>;
    gameSessions: Collection<GameSessionDocument>;
    notifications: Collection<NotificationDocument>;
    favorites: Collection<FavoriteDocument>;
    favoriteGroups: Collection<FavoriteGroupDocument>;
    moderations: Collection<ModerationDocument>;
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
        avatars: db.collection<AvatarDocument>("avatars"),
        friendSnapshots: db.collection<FriendSnapshotDocument>("friend_snapshots"),
        activityEvents: db.collection<ActivityEventDocument>("activity_events"),
        gameSessions: db.collection<GameSessionDocument>("game_sessions"),
        notifications: db.collection<NotificationDocument>("notifications"),
        favorites: db.collection<FavoriteDocument>("favorites"),
        favoriteGroups: db.collection<FavoriteGroupDocument>("favorite_groups"),
        moderations: db.collection<ModerationDocument>("moderations"),
        schemaMigrations: db.collection<SchemaMigrationDocument>("schema_migrations"),
        mutualGraph: db.collection<MutualGraphDocument>("mutual_graph"),
    };
}
