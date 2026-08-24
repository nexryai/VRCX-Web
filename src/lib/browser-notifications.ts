import type { VrchatNotification } from "@/lib/vrchat/types";

export type BrowserNotificationDelivery = {
    id: string;
    title: string;
    body: string;
    tag: string;
    href: "/feed" | "/notification";
};

export type BrowserActivity = {
    id: string;
    type: "DisplayName" | "Friend" | "GPS" | "Offline" | "Online" | "Status" | "TrustLevel" | "Unfriend";
    displayName: string;
    previous?: string;
    current?: string;
};

const typeLabels: Record<string, string> = {
    friendRequest: "Friend request",
    invite: "Invite",
    requestInvite: "Invite request",
    inviteResponse: "Invite response",
    requestInviteResponse: "Invite request response",
    boop: "Boop",
    groupChange: "Group change",
    "group.announcement": "Group announcement",
    "group.event.created": "Group event created",
    "group.event.starting": "Group event starting",
    "group.informative": "Group information",
    "group.invite": "Group invite",
    "group.joinRequest": "Group join request",
    "group.transfer": "Group transfer",
    "group.queueReady": "Group queue ready",
    "instance.closed": "Instance closed",
};

export function browserNotificationMessage(notification: VrchatNotification) {
    const sender = notification.senderUsername?.trim();
    const fallbackTitle = typeLabels[notification.type] || notification.type || "VRChat notification";
    const title = notification.title?.trim() || sender || fallbackTitle;
    const details = notification.details && typeof notification.details === "object" && !Array.isArray(notification.details) ? notification.details : {};
    const detailMessage = [details.inviteMessage, details.requestMessage, details.responseMessage].find((value) => typeof value === "string" && value.trim());
    const message = (typeof detailMessage === "string" ? detailMessage : notification.message)?.trim() || "";
    let body = message || fallbackTitle;
    if (notification.type === "friendRequest") body = "has sent you a friend request";
    if (notification.type === "invite") {
        const location = typeof details.worldName === "string" ? details.worldName.trim() : "";
        body = ["has invited you to", location, message].filter(Boolean).join(" ");
    }
    if (notification.type === "requestInvite") body = ["has requested an invite", message].filter(Boolean).join(" ");
    if (notification.type === "inviteResponse") body = ["has responded to your invite", message].filter(Boolean).join(" ");
    if (notification.type === "requestInviteResponse") body = ["has responded to your invite request", message].filter(Boolean).join(" ");
    return { title: title.slice(0, 160), body: body.slice(0, 1_000) };
}

export function browserActivityMessage(activity: BrowserActivity) {
    let title = activity.displayName;
    let body: string = activity.type;
    if (activity.type === "Online") body = activity.current ? `has logged in to ${activity.current}` : "has logged in";
    if (activity.type === "Offline") body = "has logged out";
    if (activity.type === "GPS") body = activity.current ? `is in ${activity.current}` : "changed location";
    if (activity.type === "Status") body = activity.current ? `status is now ${activity.current.replaceAll("\n", " ").trim()}` : "updated their status";
    if (activity.type === "Friend") body = "is now your friend";
    if (activity.type === "Unfriend") body = "is no longer your friend";
    if (activity.type === "TrustLevel") body = activity.current ? `Trust level is now ${activity.current}` : "changed trust level";
    if (activity.type === "DisplayName") {
        title = activity.previous?.trim() || activity.displayName;
        body = `changed their name to ${activity.displayName}`;
    }
    return { title: title.slice(0, 160), body: body.slice(0, 1_000) };
}

export function notificationDelivery(notification: VrchatNotification): BrowserNotificationDelivery {
    return { id: notification.id, ...browserNotificationMessage(notification), tag: `vrcx:notification:${notification.id}`, href: "/notification" };
}

export function activityDelivery(activity: BrowserActivity): BrowserNotificationDelivery {
    return { id: activity.id, ...browserActivityMessage(activity), tag: `vrcx:activity:${activity.id}`, href: "/feed" };
}
