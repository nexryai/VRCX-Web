import type { VrchatUser } from "./vrchat/types";

export function friendImage(friend: VrchatUser) {
    return friend.userIcon || friend.profilePicOverride || friend.currentAvatarThumbnailImageUrl || friend.currentAvatarImageUrl || "";
}

export function locationLabel(friend: VrchatUser) {
    if (friend.world?.name) {
        return friend.world.name;
    }
    if (friend.location === "private") {
        return "Private";
    }
    if (friend.location === "traveling" || friend.travelingToLocation) {
        return "Traveling";
    }
    if (!friend.location || friend.location === "offline") {
        return "Offline";
    }
    return friend.location;
}

export function groupFriendsByLocation(friends: VrchatUser[]) {
    const groups = new Map<string, VrchatUser[]>();
    for (const friend of friends) {
        const label = locationLabel(friend);
        const existing = groups.get(label);
        if (existing) {
            existing.push(friend);
        } else {
            groups.set(label, [friend]);
        }
    }

    return Array.from(groups, ([location, members]) => ({
        location,
        members: members.toSorted((a, b) => a.displayName.localeCompare(b.displayName)),
    })).toSorted((a, b) => b.members.length - a.members.length || a.location.localeCompare(b.location));
}

export function statusColor(status?: string) {
    if (status === "join me") return "var(--status-joinme)";
    if (status === "ask me") return "var(--status-askme)";
    if (status === "busy") return "var(--status-busy)";
    if (status === "offline") return "var(--status-offline)";
    return "var(--status-online)";
}
