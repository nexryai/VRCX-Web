"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Bell, Check, CheckCheck, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, Search, Send } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import type { VrchatNotification } from "@/lib/vrchat/types";

type NotificationSource = "hidden" | "legacy" | "v2";
type NotificationAction = "accept" | "hide" | "respond" | "see";

const PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 50;

const notificationLabels: Record<string, string> = {
    requestInvite: "Invite request",
    invite: "Invite",
    requestInviteResponse: "Invite request response",
    inviteResponse: "Invite response",
    friendRequest: "Friend request",
    ignoredFriendRequest: "Ignored friend request",
    message: "Message",
    boop: "Boop",
    "event.announcement": "Event announcement",
    groupChange: "Group change",
    "group.announcement": "Group announcement",
    "group.informative": "Group information",
    "group.invite": "Group invite",
    "group.joinRequest": "Group join request",
    "group.transfer": "Group transfer",
    "group.queueReady": "Group queue ready",
    "group.event.created": "Group event created",
    "group.event.starting": "Group event starting",
    "moderation.warning.group": "Group warning",
    "moderation.report.closed": "Report closed",
    "moderation.contentrestriction": "Content restriction",
    "instance.closed": "Instance closed",
    "economy.alert": "Economy alert",
    "twitchdrop.fulfilled": "Twitch drop fulfilled",
};

function notificationDate(notification: VrchatNotification) {
    const value = notification.created_at ?? notification.createdAt;
    if (typeof value === "number") return new Date(value < 1_000_000_000_000 ? value * 1_000 : value);
    return value ? new Date(value) : null;
}

function notificationTimestamp(notification: VrchatNotification) {
    const date = notificationDate(notification);
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function formatDate(notification: VrchatNotification) {
    const date = notificationDate(notification);
    if (!date || Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeExternalUrl(value?: string) {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function actionSource(notification: VrchatNotification): "legacy" | "v2" {
    return notification.source === "v2" ? "v2" : "legacy";
}

async function loadSource(source: NotificationSource) {
    const collected: VrchatNotification[] = [];
    // VRCX pages to the upstream limit so old pending friend requests remain reachable.
    for (let page = 0; page < MAX_PAGE_COUNT; page += 1) {
        const response = await fetch(`/api/notifications?source=${source}&offset=${page * PAGE_SIZE}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; notifications?: VrchatNotification[] };
        if (response.status === 401) {
            window.location.assign("/login");
            return [];
        }
        if (!response.ok || !payload.notifications) throw new Error(payload.error || "Notifications could not be loaded.");
        collected.push(...payload.notifications);
        if (payload.notifications.length < PAGE_SIZE) break;
    }
    return collected;
}

export function NotificationView() {
    const { openUser } = useFriends();
    const [notifications, setNotifications] = useState<VrchatNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [updatingId, setUpdatingId] = useState("");
    const [markingAll, setMarkingAll] = useState(false);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const results = await Promise.all([loadSource("legacy"), loadSource("v2"), loadSource("hidden")]);
            const byId = new Map<string, VrchatNotification>();
            for (const notification of results.flat()) byId.set(notification.id, notification);
            setNotifications(Array.from(byId.values()).toSorted((a, b) => notificationTimestamp(b) - notificationTimestamp(a)));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    const types = useMemo(() => Array.from(new Set(notifications.map((notification) => notification.type))).toSorted(), [notifications]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return notifications.filter((notification) => {
            if (typeFilter !== "all" && notification.type !== typeFilter) return false;
            if (!query) return true;
            return `${notification.senderUsername || ""} ${notification.message || ""} ${notification.title || ""} ${notification.type}`.toLocaleLowerCase().includes(query);
        });
    }, [notifications, search, typeFilter]);
    const unseenCount = notifications.filter((notification) => notification.seen === false).length;

    async function updateNotification(notification: VrchatNotification, action: NotificationAction, responseType?: string, responseData?: string) {
        setUpdatingId(notification.id);
        setError("");
        try {
            const source = actionSource(notification);
            const response = await fetch(`/api/notifications/${notification.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, source, responseType, responseData: responseData || "" }),
            });
            const payload = (await response.json()) as { error?: string };
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok) throw new Error(payload.error || "The notification could not be updated.");
            if (action === "see") {
                setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, seen: true } : item)));
            } else {
                setNotifications((current) => current.filter((item) => item.id !== notification.id));
            }
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The notification could not be updated.");
            throw actionError;
        } finally {
            setUpdatingId("");
        }
    }

    async function markAllRead() {
        setMarkingAll(true);
        setError("");
        try {
            // Keep requests sequential to avoid an avoidable burst against VRChat's API.
            for (const notification of notifications.filter((item) => item.seen === false)) {
                await updateNotification(notification, "see");
            }
        } catch {
            // updateNotification has already exposed the actionable upstream error.
        } finally {
            setMarkingAll(false);
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="notifications-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 min-w-44 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter notification type">
                    <option value="all">All notification types</option>
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {notificationLabels[type] || type}
                        </option>
                    ))}
                </select>
                <label className="relative min-w-44 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder="Search notifications" />
                </label>
                <button type="button" onClick={() => void markAllRead()} disabled={!unseenCount || markingAll || loading} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Mark all notifications as read">
                    {markingAll ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CheckCheck aria-hidden="true" className="size-4" />}
                    <span className="hidden sm:inline">Mark all read</span>
                </button>
                <button type="button" onClick={() => void loadNotifications()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh notifications">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
                <h1 id="notifications-heading" className="sr-only">
                    Notifications
                </h1>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Bell aria-hidden="true" className="size-4" />
                    {filtered.length} notifications · {unseenCount} unread
                    {loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                </div>
                {error ? <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
                {!loading && !error && filtered.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">No notifications match the current filters.</p> : null}

                <div className="space-y-2">
                    {filtered.map((notification) => (
                        <NotificationRow key={notification.id} notification={notification} busy={updatingId === notification.id || markingAll} openUser={openUser} updateNotification={updateNotification} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function NotificationRow({ notification, busy, openUser, updateNotification }: { notification: VrchatNotification; busy: boolean; openUser: (userId: string) => void; updateNotification: (notification: VrchatNotification, action: NotificationAction, responseType?: string, responseData?: string) => Promise<void> }) {
    const link = safeExternalUrl(notification.link);
    const isLegacyFriendRequest = notification.source !== "v2" && (notification.type === "friendRequest" || notification.type === "ignoredFriendRequest");

    return (
        <article className={`rounded-lg border bg-card p-3 ${notification.seen === false ? "border-primary/50 shadow-[inset_3px_0_0_var(--primary)]" : "border-border"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{notificationLabels[notification.type] || notification.type}</span>
                        <time className="text-[10px] text-muted-foreground">{formatDate(notification)}</time>
                        {notification.seen === false ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">Unread</span> : null}
                    </div>
                    {notification.senderUserId ? (
                        <button type="button" onClick={() => openUser(notification.senderUserId || "")} className="mt-2 block max-w-full truncate text-left text-sm font-medium hover:text-primary">
                            {notification.senderUsername || notification.senderUserId}
                        </button>
                    ) : notification.senderUsername ? (
                        <p className="mt-2 truncate text-sm font-medium">{notification.senderUsername}</p>
                    ) : null}
                    {notification.title ? <p className="mt-2 text-sm font-medium">{notification.title}</p> : null}
                    {notification.message ? <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{notification.message}</p> : null}
                    {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            {notification.linkText || "Open link"}
                            <ExternalLink aria-hidden="true" className="size-3" />
                        </a>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-t border-border pt-2 sm:max-w-72 sm:border-0 sm:pt-0">
                    {notification.seen === false ? (
                        <ActionButton label="Mark as read" busy={busy} onClick={() => updateNotification(notification, "see")}>
                            <Eye aria-hidden="true" className="size-4" />
                        </ActionButton>
                    ) : null}
                    {isLegacyFriendRequest ? (
                        <ActionButton label="Accept friend request" busy={busy} onClick={() => updateNotification(notification, "accept")}>
                            <Check aria-hidden="true" className="size-4" />
                        </ActionButton>
                    ) : null}
                    {notification.source === "v2"
                        ? notification.responses?.map((response) => {
                              const responseLink = response.type === "link" ? safeExternalUrl(response.data) : null;
                              const label = response.text || response.label || response.type;
                              return responseLink ? (
                                  <a key={`${response.type}:${response.data || ""}`} href={responseLink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
                                      <ExternalLink aria-hidden="true" className="size-3.5" />
                                      {label}
                                  </a>
                              ) : (
                                  <ActionButton key={`${response.type}:${response.data || ""}`} label={label} busy={busy} onClick={() => updateNotification(notification, "respond", response.type, response.data)}>
                                      <Send aria-hidden="true" className="size-3.5" />
                                  </ActionButton>
                              );
                          })
                        : null}
                    <ActionButton label="Hide notification" busy={busy} onClick={() => updateNotification(notification, "hide")}>
                        <EyeOff aria-hidden="true" className="size-4" />
                    </ActionButton>
                </div>
            </div>
        </article>
    );
}

function ActionButton({ label, busy, onClick, children }: { label: string; busy: boolean; onClick: () => Promise<void>; children: React.ReactNode }) {
    return (
        <button type="button" onClick={() => void onClick()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label={label} title={label}>
            {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : children}
            <span className="hidden lg:inline">{label}</span>
        </button>
    );
}
