import type { VrchatNotification } from "@/lib/vrchat/types";

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
