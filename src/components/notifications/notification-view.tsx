"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowUpDown, Ban, BellOff, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Link as LinkIcon, Loader2, MessageCircle, RefreshCw, Reply, Send, Tag, Trash2, X } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import type { VrchatNotification } from "@/lib/vrchat/types";

type NotificationSource = "hidden" | "legacy" | "v2";
type NotificationAction = "accept" | "hide" | "respond";
type PageSize = 20 | 50 | 100;

const PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 50;
const knownTypes = [
    "requestInvite",
    "invite",
    "requestInviteResponse",
    "inviteResponse",
    "friendRequest",
    "ignoredFriendRequest",
    "message",
    "boop",
    "event.announcement",
    "groupChange",
    "group.announcement",
    "group.informative",
    "group.invite",
    "group.joinRequest",
    "group.transfer",
    "group.queueReady",
    "group.event.created",
    "group.event.starting",
    "moderation.warning.group",
    "moderation.report.closed",
    "moderation.contentrestriction",
    "instance.closed",
    "economy.alert",
    "twitchdrop.fulfilled",
];

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

function formatDate(notification: VrchatNotification, long = false) {
    const date = notificationDate(notification);
    if (!date || Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en", long ? { dateStyle: "long", timeStyle: "medium" } : { dateStyle: "short", timeStyle: "short" }).format(date);
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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function actionSource(notification: VrchatNotification): "legacy" | "v2" {
    return notification.source === "v2" ? "v2" : "legacy";
}

async function loadSource(source: NotificationSource) {
    const collected: VrchatNotification[] = [];
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
    const [filters, setFilters] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState<PageSize>(20);
    const [ascending, setAscending] = useState(false);
    const [updatingId, setUpdatingId] = useState("");

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const results = await Promise.all([loadSource("legacy"), loadSource("v2"), loadSource("hidden")]);
            const bySourceAndId = new Map<string, VrchatNotification>();
            for (const notification of results.flat()) bySourceAndId.set(`${notification.source || "legacy"}:${notification.id}`, notification);
            setNotifications(Array.from(bySourceAndId.values()).toSorted((left, right) => notificationTimestamp(right) - notificationTimestamp(left)));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void Promise.all([
            loadNotifications(),
            fetch("/api/settings", { cache: "no-store" })
                .then((response) => response.json())
                .then((settings: { notificationFilters?: string[]; notificationTablePageSize?: PageSize }) => {
                    setFilters(settings.notificationFilters || []);
                    setPageSize(settings.notificationTablePageSize || 20);
                }),
        ]);
    }, [loadNotifications]);

    const types = useMemo(() => Array.from(new Set([...knownTypes, ...notifications.map((notification) => notification.type)])), [notifications]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return notifications
            .filter((notification) => {
                if (filters.length && !filters.includes(notification.type)) return false;
                const details = asRecord(notification.details);
                if (!query) return true;
                return `${notification.senderUsername || ""} ${notification.message || ""} ${notification.title || ""} ${notification.type} ${notification.groupName || ""} ${textValue(details.groupName)}`.toLocaleLowerCase().includes(query);
            })
            .toSorted((left, right) => (ascending ? 1 : -1) * (notificationTimestamp(left) - notificationTimestamp(right)));
    }, [ascending, filters, notifications, search]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

    function toggleFilter(type: string) {
        const next = filters.includes(type) ? filters.filter((value) => value !== type) : [...filters, type];
        setFilters(next);
        setPage(0);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationFilters: next }) });
    }

    function updatePageSize(notificationTablePageSize: PageSize) {
        setPageSize(notificationTablePageSize);
        setPage(0);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationTablePageSize }) });
    }

    async function refreshNotifications() {
        setLoading(true);
        try {
            const response = await fetch("/api/monitor/reconcile", { method: "POST" });
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok && response.status !== 409) {
                const payload = (await response.json()) as { error?: string };
                throw new Error(payload.error || "Notifications could not be refreshed.");
            }
            await loadNotifications();
        } catch (refreshError) {
            setError(refreshError instanceof Error ? refreshError.message : "Notifications could not be refreshed.");
            setLoading(false);
        }
    }

    async function updateNotification(notification: VrchatNotification, action: NotificationAction, responseType?: string, responseData?: string) {
        setUpdatingId(notification.id);
        setError("");
        try {
            const response = await fetch(`/api/notifications/${notification.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, source: actionSource(notification), responseType, responseData: responseData || "" }),
            });
            const payload = (await response.json()) as { error?: string };
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok) throw new Error(payload.error || "The notification could not be updated.");
            setNotifications((current) => current.filter((item) => !(item.id === notification.id && item.source === notification.source)));
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The notification could not be updated.");
        } finally {
            setUpdatingId("");
        }
    }

    async function deleteLog(notification: VrchatNotification, bypassConfirmation: boolean) {
        if (!bypassConfirmation && !window.confirm("Delete this notification log entry?")) return;
        setUpdatingId(notification.id);
        const response = await fetch(`/api/notifications/${notification.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: notification.source || "legacy" }) });
        if (response.ok) setNotifications((current) => current.filter((item) => !(item.id === notification.id && item.source === notification.source)));
        else setError("The notification log entry could not be deleted.");
        setUpdatingId("");
    }

    return (
        <section className="flex h-full min-h-0 flex-col p-2" aria-labelledby="notifications-heading">
            <h1 id="notifications-heading" className="sr-only">
                Notifications
            </h1>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <details className="relative min-w-52 flex-1 sm:max-w-[50%]">
                    <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-input px-3 text-xs [&::-webkit-details-marker]:hidden">
                        <span className="truncate text-muted-foreground">{filters.length ? filters.map((type) => notificationLabels[type] || type).join(", ") : "Filter notification types"}</span>
                        <ChevronDown className="size-4 shrink-0" />
                    </summary>
                    <div className="absolute top-10 left-0 z-30 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-border bg-popover p-1 shadow-xl">
                        {types.map((type) => (
                            <label key={type} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted">
                                <input type="checkbox" checked={filters.includes(type)} onChange={() => toggleFilter(type)} className="accent-primary" />
                                {notificationLabels[type] || type}
                            </label>
                        ))}
                    </div>
                </details>
                <div className="flex min-w-52 flex-1 items-center justify-end gap-2 sm:max-w-md">
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(0);
                        }}
                        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                        placeholder="Search notifications"
                    />
                    <button type="button" onClick={() => void refreshNotifications()} disabled={loading} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Refresh notifications">
                        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>
            {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading notifications" />
                    </div>
                ) : null}
                {!loading && !visible.length ? <div className="flex min-h-64 items-center justify-center text-xs text-muted-foreground">No data</div> : null}
                {!loading && visible.length ? <NotificationTable notifications={visible} toggleSort={() => setAscending((value) => !value)} busyId={updatingId} openUser={openUser} updateNotification={updateNotification} deleteLog={deleteLog} /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
                <span>
                    {filtered.length} notification{filtered.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1">
                        Rows{" "}
                        <select value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)} className="h-7 rounded border border-input bg-background px-1 text-[10px]">
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </label>
                    <span>
                        {safePage + 1} / {pageCount}
                    </span>
                    <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Previous page">
                        <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage + 1 >= pageCount} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Next page">
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            </div>
        </section>
    );
}

type TableProps = {
    notifications: VrchatNotification[];
    toggleSort: () => void;
    busyId: string;
    openUser: (id: string) => void;
    updateNotification: (notification: VrchatNotification, action: NotificationAction, responseType?: string, responseData?: string) => Promise<void>;
    deleteLog: (notification: VrchatNotification, bypassConfirmation: boolean) => Promise<void>;
};

function NotificationTable({ notifications, toggleSort, busyId, openUser, updateNotification, deleteLog }: TableProps) {
    return (
        <table className="w-full min-w-[925px] table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                <tr>
                    <th className="w-5" />
                    <th className="w-[120px] px-2 py-2">
                        <button type="button" onClick={toggleSort} className="inline-flex items-center gap-1 hover:text-foreground">
                            Date <ArrowUpDown className="size-3.5" />
                        </button>
                    </th>
                    <th className="w-[180px] px-2 py-2">Type</th>
                    <th className="w-[150px] px-2 py-2">User</th>
                    <th className="w-[150px] px-2 py-2">Group</th>
                    <th className="w-20 px-2 py-2">Photo</th>
                    <th className="px-2 py-2">Message</th>
                    <th className="w-[120px] px-2 py-2 text-right">Action</th>
                </tr>
            </thead>
            <tbody>
                {notifications.map((notification) => (
                    <NotificationRow key={`${notification.source}:${notification.id}`} notification={notification} busy={busyId === notification.id} openUser={openUser} updateNotification={updateNotification} deleteLog={deleteLog} />
                ))}
            </tbody>
        </table>
    );
}

function NotificationRow({ notification, busy, openUser, updateNotification, deleteLog }: { notification: VrchatNotification; busy: boolean; openUser: (id: string) => void; updateNotification: TableProps["updateNotification"]; deleteLog: TableProps["deleteLog"] }) {
    const details = asRecord(notification.details);
    const data = asRecord(notification.data);
    const groupName = notification.groupName || textValue(data.groupName) || textValue(details.groupName) || (notification.senderUserId?.startsWith("grp_") ? notification.senderUsername : "");
    const image = textValue(details.imageUrl) || notification.imageUrl || "";
    const message = [notification.title, notification.message].filter(Boolean).join(", ") || textValue(details.inviteMessage) || textValue(details.requestMessage) || textValue(details.responseMessage) || textValue(details.worldName);
    const link = safeExternalUrl(notification.link);
    const friendRequest = notification.type === "friendRequest" || notification.type === "ignoredFriendRequest";
    const canActUpstream = notification.source !== "hidden";
    // V2 responses use their own action descriptors; the legacy accept endpoint
    // must never receive a V2 notification ID even when its type looks similar.
    const canAcceptFriendRequest = friendRequest && notification.source !== "v2" && notification.source !== "hidden";
    const canHide =
        canActUpstream &&
        notification.type !== "requestInviteResponse" &&
        notification.type !== "inviteResponse" &&
        notification.type !== "message" &&
        notification.type !== "boop" &&
        notification.type !== "groupChange" &&
        !notification.type.includes("group.") &&
        !notification.type.includes("moderation.") &&
        !notification.type.includes("instance.") &&
        !notification.link?.startsWith("economy.");
    return (
        <tr className="hover:bg-muted/50">
            <td className="border-t border-border" />
            <td className="whitespace-nowrap border-t border-border px-2 py-2 text-muted-foreground" title={formatDate(notification, true)}>
                {formatDate(notification)}
            </td>
            <td className="border-t border-border px-2 py-2">
                <span className="inline-flex max-w-full rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{notificationLabels[notification.type] || notification.type}</span>
                {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="ml-1 inline-block text-primary" aria-label={notification.linkText || "Open notification link"}>
                        <ExternalLink className="size-3" />
                    </a>
                ) : null}
            </td>
            <td className="truncate border-t border-border px-2 py-2">
                {notification.senderUserId && !notification.senderUserId.startsWith("grp_") ? (
                    <button type="button" onClick={() => openUser(notification.senderUserId || "")} className="max-w-full truncate hover:text-primary">
                        {notification.senderUsername || notification.senderUserId}
                    </button>
                ) : notification.senderUsername && !groupName ? (
                    notification.senderUsername
                ) : (
                    ""
                )}
            </td>
            <td className="truncate border-t border-border px-2 py-2">{groupName}</td>
            <td className="border-t border-border px-2 py-2">
                {image && !image.startsWith("default_") ? (
                    <a href={safeExternalUrl(image) || undefined} target="_blank" rel="noreferrer" className="inline-flex size-8 items-center justify-center overflow-hidden rounded bg-muted">
                        {safeExternalUrl(image) ? <img src={image} alt="Notification" className="size-full object-cover" loading="lazy" /> : <ImageIcon className="size-4" />}
                    </a>
                ) : null}
            </td>
            <td className="truncate border-t border-border px-2 py-2" title={message}>
                {message}
            </td>
            <td className="border-t border-border px-2 py-2">
                <div className="flex items-center justify-end gap-2">
                    {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <>
                            {canAcceptFriendRequest ? (
                                <IconAction
                                    label="Accept"
                                    onClick={() => {
                                        if (window.confirm("Accept this friend request?")) void updateNotification(notification, "accept");
                                    }}
                                >
                                    <Check className="size-4" />
                                </IconAction>
                            ) : null}
                            {canActUpstream && notification.source === "v2"
                                ? notification.responses?.map((response) => {
                                      const responseLink = response.type === "link" ? safeExternalUrl(response.data) : null;
                                      const label = response.text || response.label || response.type;
                                      return responseLink ? (
                                          <a key={`${response.type}:${response.data || ""}`} href={responseLink} target="_blank" rel="noreferrer" title={label}>
                                              <ResponseIcon icon={response.icon} type={response.type} notificationType={notification.type} />
                                          </a>
                                      ) : (
                                          <IconAction key={`${response.type}:${response.data || ""}`} label={label} onClick={() => void updateNotification(notification, "respond", response.type, response.data)}>
                                              <ResponseIcon icon={response.icon} type={response.type} notificationType={notification.type} />
                                          </IconAction>
                                      );
                                  })
                                : null}
                            {canHide ? (
                                <IconAction
                                    label="Hide"
                                    onClick={(event) => {
                                        if (event.shiftKey || window.confirm("Hide this notification?")) void updateNotification(notification, "hide");
                                    }}
                                >
                                    <X className="size-4" />
                                </IconAction>
                            ) : null}
                            {!friendRequest ? (
                                <IconAction label="Delete log" onClick={(event) => void deleteLog(notification, event.shiftKey)}>
                                    <Trash2 className="size-4" />
                                </IconAction>
                            ) : null}
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

function ResponseIcon({ icon, type, notificationType }: { icon?: string; type: string; notificationType: string }) {
    if (type === "link") return <LinkIcon className="size-4" />;
    if (icon === "check") return <Check className="size-4" />;
    if (icon === "cancel") return <X className="size-4" />;
    if (icon === "ban") return <Ban className="size-4" />;
    if (icon === "bell-slash") return <BellOff className="size-4" />;
    if (icon === "reply") return notificationType === "boop" ? <MessageCircle className="size-4" /> : <Reply className="size-4" />;
    if (icon === "message") return <MessageCircle className="size-4" />;
    if (icon === "link") return <LinkIcon className="size-4" />;
    if (icon === "send") return <Send className="size-4" />;
    return <Tag className="size-4" />;
}

function IconAction({ label, onClick, children }: { label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={label} title={label}>
            {children}
        </button>
    );
}
