import type { VrchatUser } from "./vrchat/types";

export type ActivityType = "Avatar" | "Bio" | "DisplayName" | "Friend" | "FriendRequest" | "GPS" | "Offline" | "Online" | "Status" | "TrustLevel" | "Unfriend";

export type FriendActivity = {
    id: string;
    type: ActivityType;
    userId: string;
    displayName: string;
    createdAt: string;
    previous?: string;
    current?: string;
};

export type FriendSnapshot = {
    id: string;
    displayName: string;
    online: boolean;
    status: string;
    location: string;
    avatar: string;
    bio: string;
    trustLevel: string;
};

/** Ported from VRCX/src/shared/utils/userTransforms.js. */
export function trustLevelFromTags(tags: string[] = []) {
    if (tags.includes("system_trust_veteran")) return "Trusted User";
    if (tags.includes("system_trust_trusted")) return "Known User";
    if (tags.includes("system_trust_known")) return "User";
    if (tags.includes("system_trust_basic")) return "New User";
    return "Visitor";
}

export function toFriendSnapshots(allFriends: VrchatUser[], onlineIds: Set<string>): FriendSnapshot[] {
    return allFriends.map((friend) => ({
        id: friend.id,
        displayName: friend.displayName,
        online: onlineIds.has(friend.id),
        status: `${friend.status || ""}\n${friend.statusDescription || ""}`,
        location: friend.location || friend.travelingToLocation || "",
        avatar: friend.currentAvatarThumbnailImageUrl || friend.currentAvatarImageUrl || "",
        bio: friend.bio || "",
        trustLevel: trustLevelFromTags(friend.tags),
    }));
}

export function diffFriendSnapshots(previous: FriendSnapshot[], current: FriendSnapshot[], now = new Date().toISOString(), includeRelationshipChanges = true): FriendActivity[] {
    const before = new Map(previous.map((friend) => [friend.id, friend]));
    const after = new Map(current.map((friend) => [friend.id, friend]));
    const entries: FriendActivity[] = [];
    const add = (type: ActivityType, friend: FriendSnapshot, oldValue?: string, newValue?: string) => {
        entries.push({ id: `${now}:${friend.id}:${type}:${entries.length}`, type, userId: friend.id, displayName: friend.displayName, createdAt: now, previous: oldValue, current: newValue });
    };

    for (const friend of current) {
        const old = before.get(friend.id);
        if (!old) {
            if (includeRelationshipChanges) add("Friend", friend);
            continue;
        }
        if (old.displayName !== friend.displayName) add("DisplayName", friend, old.displayName, friend.displayName);
        if (old.online !== friend.online) add(friend.online ? "Online" : "Offline", friend, old.location, friend.location);
        if (old.online && friend.online && old.location !== friend.location) add("GPS", friend, old.location, friend.location);
        if (old.status !== friend.status) add("Status", friend, old.status, friend.status);
        if (old.avatar !== friend.avatar) add("Avatar", friend, old.avatar, friend.avatar);
        if (old.bio !== friend.bio) add("Bio", friend, old.bio, friend.bio);
        if (old.trustLevel !== friend.trustLevel) add("TrustLevel", friend, old.trustLevel, friend.trustLevel);
    }
    for (const friend of previous) {
        if (includeRelationshipChanges && !after.has(friend.id)) add("Unfriend", friend);
    }
    return entries;
}
