import { locationLabel } from "./friends";
import type { VrchatUser } from "./vrchat/types";

export const sidebarSortMethods = ["Sort Alphabetically", "Sort by Status", "Sort Private to Bottom", "Sort by Last Active", "Sort by Location"] as const;
export type SidebarSortMethod = (typeof sidebarSortMethods)[number];

const statusOrder = new Map([
    ["join me", 0],
    ["active", 1],
    ["ask me", 2],
    ["busy", 3],
    ["offline", 4],
]);

function compare(method: SidebarSortMethod, left: VrchatUser, right: VrchatUser) {
    if (method === "Sort Alphabetically") return left.displayName.localeCompare(right.displayName);
    if (method === "Sort Private to Bottom") return Number(left.location === "private") - Number(right.location === "private");
    if (method === "Sort by Status") return (statusOrder.get(left.status || left.state || "offline") ?? 5) - (statusOrder.get(right.status || right.state || "offline") ?? 5);
    if (method === "Sort by Location") {
        if (left.state !== "online" || right.state !== "online") return 0;
        return (left.location || "").localeCompare(right.location || "");
    }
    const leftAt = Date.parse(left.state === "online" ? left.last_login || left.last_activity || "" : left.last_activity || "");
    const rightAt = Date.parse(right.state === "online" ? right.last_login || right.last_activity || "" : right.last_activity || "");
    return (Number.isFinite(rightAt) ? rightAt : 0) - (Number.isFinite(leftAt) ? leftAt : 0);
}

export function sortSidebarFriends(friends: VrchatUser[], methods: SidebarSortMethod[]) {
    return friends.toSorted((left, right) => {
        for (const method of methods) {
            const result = compare(method, left, right);
            if (result) return result;
        }
        return left.displayName.localeCompare(right.displayName);
    });
}

function isInstanceLocation(location?: string) {
    return /^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[^~\s]+(?:~|$)/i.test(location || "");
}

// VRCX groups only online friends sharing the exact same real instance, and
// omits singleton locations from its grouped section.
export function groupSidebarFriendInstances(friends: VrchatUser[], methods: SidebarSortMethod[], showAgeGatedInstances = false) {
    const byLocation = new Map<string, VrchatUser[]>();
    for (const friend of friends) {
        if (friend.state !== "online" || !isInstanceLocation(friend.location)) continue;
        byLocation.set(friend.location || "", [...(byLocation.get(friend.location || "") ?? []), friend]);
    }
    return [...byLocation]
        .filter(([, members]) => members.length > 1)
        .map(([location, members]) => ({ location, label: locationLabel(members[0], showAgeGatedInstances), friends: sortSidebarFriends(members, methods) }))
        .toSorted((left, right) => right.friends.length - left.friends.length || left.label.localeCompare(right.label));
}
