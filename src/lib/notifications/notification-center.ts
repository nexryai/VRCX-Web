import type { VrchatNotification } from "@/lib/vrchat/types";

export type NotificationCategory = "friend" | "group" | "other";

const friendTypes = new Set(["friendRequest", "ignoredFriendRequest", "invite", "requestInvite", "inviteResponse", "requestInviteResponse", "boop"]);
const groupTypes = new Set(["groupChange", "event.announcement"]);

export function notificationCategory(type: string): NotificationCategory {
    if (friendTypes.has(type)) return "friend";
    if (groupTypes.has(type) || type.startsWith("group.") || type.startsWith("moderation.")) return "group";
    return "other";
}

export function notificationTimestamp(notification: VrchatNotification) {
    const value = notification.created_at ?? notification.createdAt;
    if (typeof value === "number") return value > 1_000_000_000_000 ? value : value * 1_000;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function splitNotificationCenter(notifications: VrchatNotification[], now = Date.now()) {
    const unseen: Record<NotificationCategory, VrchatNotification[]> = { friend: [], group: [], other: [] };
    const recent: Record<NotificationCategory, VrchatNotification[]> = { friend: [], group: [], other: [] };
    const cutoff = now - 24 * 60 * 60 * 1_000;
    for (const notification of notifications) {
        const category = notificationCategory(notification.type);
        if (notification.seen !== true) unseen[category].push(notification);
        else if (notificationTimestamp(notification) > cutoff) recent[category].push(notification);
    }
    for (const category of ["friend", "group", "other"] as const) {
        unseen[category].sort((left, right) => notificationTimestamp(right) - notificationTimestamp(left));
        recent[category].sort((left, right) => notificationTimestamp(right) - notificationTimestamp(left));
    }
    return { unseen, recent };
}

export function notificationDetails(value: VrchatNotification["details"]) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function notificationText(value: unknown) {
    return typeof value === "string" ? value : "";
}
