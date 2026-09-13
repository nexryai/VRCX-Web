import type { VrchatUser } from "./vrchat/types";

/** Closely translates VRCX shared/utils/user.js userImage priority. */
export function friendImage(friend: VrchatUser, displayProfileIcon: boolean) {
    return (displayProfileIcon ? friend.userIcon : undefined) || friend.profilePicOverride || friend.currentAvatarThumbnailImageUrl || friend.currentAvatarImageUrl || "";
}

/** VRCX uses the first memo line as the optional sidebar nickname. */
export function friendDisplayName(friend: Pick<VrchatUser, "displayName"> & { $memo?: string }, showMemoNickname: boolean) {
    const nickname = friend.$memo?.split(/\r?\n/, 1)[0]?.trim();
    return showMemoNickname && nickname ? `${friend.displayName} (${nickname})` : friend.displayName;
}

export function locationLabel(friend: VrchatUser, showAgeGatedInstances = false, showInstanceId = false) {
    if (!showAgeGatedInstances && (friend.location?.includes("~ageGate") || friend.travelingToLocation?.includes("~ageGate"))) return "Restricted";
    const location = friend.location === "traveling" ? friend.travelingToLocation : friend.location;
    const instanceName = location?.includes(":") ? location.slice(location.indexOf(":") + 1).split("~", 1)[0] : "";
    const suffix = showInstanceId && instanceName ? ` · #${instanceName}` : "";
    if (friend.world?.name) {
        return `${friend.world.name}${suffix}`;
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
    return `${friend.location}${suffix}`;
}

export function groupFriendsByLocation(friends: VrchatUser[], showAgeGatedInstances = false, showInstanceId = false) {
    const groups = new Map<string, VrchatUser[]>();
    for (const friend of friends) {
        const label = locationLabel(friend, showAgeGatedInstances, showInstanceId);
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

export function statusIndicatorKind(status?: string) {
    if (status === "join me") return "joinme";
    if (status === "ask me") return "askme";
    if (status === "busy") return "busy";
    if (status === "offline") return "offline";
    return "online";
}
