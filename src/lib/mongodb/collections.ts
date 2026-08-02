import "server-only";

import type { Collection, Db } from "mongodb";

import type { VrchatNotification, VrchatUser } from "@/lib/vrchat/types";

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

export type Collections = {
    appSettings: Collection<AppSettingsDocument>;
    vrchatSession: Collection<VrchatSessionDocument>;
    monitorState: Collection<MonitorStateDocument>;
    friendSnapshots: Collection<FriendSnapshotDocument>;
    activityEvents: Collection<ActivityEventDocument>;
    gameSessions: Collection<GameSessionDocument>;
    notifications: Collection<NotificationDocument>;
    mutualGraph: Collection<MutualGraphDocument>;
};

export function collections(db: Db): Collections {
    return {
        appSettings: db.collection<AppSettingsDocument>("app_settings"),
        vrchatSession: db.collection<VrchatSessionDocument>("vrchat_session"),
        monitorState: db.collection<MonitorStateDocument>("monitor_state"),
        friendSnapshots: db.collection<FriendSnapshotDocument>("friend_snapshots"),
        activityEvents: db.collection<ActivityEventDocument>("activity_events"),
        gameSessions: db.collection<GameSessionDocument>("game_sessions"),
        notifications: db.collection<NotificationDocument>("notifications"),
        mutualGraph: db.collection<MutualGraphDocument>("mutual_graph"),
    };
}
