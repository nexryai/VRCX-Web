import { z } from "zod";

export const notificationDeliveryFilterValueSchema = z.enum(["Off", "On", "VIP", "Friends", "Everyone"]);
export type NotificationDeliveryFilterValue = z.infer<typeof notificationDeliveryFilterValueSchema>;

export const notificationDeliveryFilterKeys = [
    "Online",
    "Offline",
    "GPS",
    "Status",
    "invite",
    "requestInvite",
    "inviteResponse",
    "requestInviteResponse",
    "boop",
    "friendRequest",
    "Friend",
    "Unfriend",
    "DisplayName",
    "TrustLevel",
    "group.announcement",
    "group.event.created",
    "group.event.starting",
    "group.informative",
    "group.invite",
    "group.joinRequest",
    "group.transfer",
    "group.queueReady",
    "instance.closed",
] as const;

export type NotificationDeliveryFilterKey = (typeof notificationDeliveryFilterKeys)[number];

export const notificationDeliveryFiltersSchema = z.object(Object.fromEntries(notificationDeliveryFilterKeys.map((key) => [key, notificationDeliveryFilterValueSchema])) as Record<NotificationDeliveryFilterKey, typeof notificationDeliveryFilterValueSchema>).strict();

export type NotificationDeliveryFilters = z.infer<typeof notificationDeliveryFiltersSchema>;

/** Faithful remote-observable subset of VRCX sharedFeedFiltersDefaults.noty. */
export const defaultNotificationDeliveryFilters: NotificationDeliveryFilters = {
    Online: "VIP",
    Offline: "VIP",
    GPS: "Off",
    Status: "Off",
    invite: "Friends",
    requestInvite: "Friends",
    inviteResponse: "Friends",
    requestInviteResponse: "Friends",
    boop: "Friends",
    friendRequest: "On",
    Friend: "On",
    Unfriend: "On",
    DisplayName: "VIP",
    TrustLevel: "VIP",
    "group.announcement": "On",
    "group.event.created": "On",
    "group.event.starting": "On",
    "group.informative": "On",
    "group.invite": "On",
    "group.joinRequest": "Off",
    "group.transfer": "On",
    "group.queueReady": "On",
    "instance.closed": "On",
};

export type NotificationDeliveryFilterOption = {
    value: NotificationDeliveryFilterValue;
    label: "Off" | "On" | "Favorites" | "Friends" | "Everyone";
};

const options = {
    on: [
        { value: "Off", label: "Off" },
        { value: "On", label: "On" },
    ],
    friends: [
        { value: "Off", label: "Off" },
        { value: "VIP", label: "Favorites" },
        { value: "Friends", label: "Friends" },
    ],
} satisfies Record<string, NotificationDeliveryFilterOption[]>;

export const notificationDeliveryFilterRows: Array<{
    key: NotificationDeliveryFilterKey;
    label: string;
    options: NotificationDeliveryFilterOption[];
}> = [
    { key: "Online", label: "Online", options: options.friends },
    { key: "Offline", label: "Offline", options: options.friends },
    { key: "GPS", label: "GPS", options: options.friends },
    { key: "Status", label: "Status", options: options.friends },
    { key: "invite", label: "Invite", options: options.friends },
    { key: "requestInvite", label: "Request Invite", options: options.friends },
    { key: "inviteResponse", label: "Invite Response", options: options.friends },
    { key: "requestInviteResponse", label: "Request Invite Response", options: options.friends },
    { key: "boop", label: "Boop", options: options.friends },
    { key: "friendRequest", label: "Friend Request", options: options.on },
    { key: "Friend", label: "New Friend", options: options.on },
    { key: "Unfriend", label: "Unfriend", options: options.on },
    { key: "DisplayName", label: "Display Name Change", options: options.friends },
    { key: "TrustLevel", label: "Trust Level Change", options: options.friends },
    { key: "group.announcement", label: "Group Announcement", options: options.on },
    { key: "group.event.created", label: "Group Event Created", options: options.on },
    { key: "group.event.starting", label: "Group Event Starting", options: options.on },
    { key: "group.informative", label: "Group Join", options: options.on },
    { key: "group.invite", label: "Group Invite", options: options.on },
    { key: "group.joinRequest", label: "Group Join Request", options: options.on },
    { key: "group.transfer", label: "Group Transfer Request", options: options.on },
    { key: "group.queueReady", label: "Instance Queue Ready", options: options.on },
    { key: "instance.closed", label: "Instance Closed", options: options.on },
];

export function isNotificationDeliveryFilterKey(value: string): value is NotificationDeliveryFilterKey {
    return (notificationDeliveryFilterKeys as readonly string[]).includes(value);
}

export function shouldDeliverFilteredEvent(value: NotificationDeliveryFilterValue, relationship: { isFriend: boolean; isFavorite: boolean }) {
    if (value === "Off") return false;
    if (value === "On" || value === "Everyone") return true;
    if (value === "Friends") return relationship.isFriend;
    return relationship.isFavorite;
}
