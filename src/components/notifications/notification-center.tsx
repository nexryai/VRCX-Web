"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Ban, Bell, BellOff, Check, ExternalLink, Link as LinkIcon, Mail, MessageCircle, Reply, Send, Tag, Trash2, UserPlus, Users, X } from "lucide-react";

import { VrchatImage } from "@/components/vrchat-image";
import { safeExternalHttpUrl } from "@/lib/browser-url";
import { type NotificationCategory, notificationDetails, notificationText, notificationTimestamp, splitNotificationCenter } from "@/lib/notifications/notification-center";
import type { VrchatNotification, VrchatUser } from "@/lib/vrchat/types";

const categories: Array<{ value: NotificationCategory; label: string }> = [
    { value: "friend", label: "Friend" },
    { value: "group", label: "Group" },
    { value: "other", label: "Other" },
];

const typeLabels: Record<string, string> = {
    friendRequest: "Friend Request",
    ignoredFriendRequest: "Ignored Friend Request",
    invite: "Invite",
    requestInvite: "Invite Request",
    inviteResponse: "Invite Response",
    requestInviteResponse: "Invite Request Response",
    boop: "Boop",
    message: "Message",
    groupChange: "Group Change",
    "group.announcement": "Group Announcement",
    "group.event.created": "Group Event Created",
    "group.event.starting": "Group Event Starting",
    "group.informative": "Group Informative",
    "group.invite": "Group Invite",
    "group.joinRequest": "Group Join Request",
    "group.transfer": "Group Transfer Request",
    "group.queueReady": "Instance Queue Ready",
    "instance.closed": "Instance Closed",
};

function notificationKey(notification: VrchatNotification) {
    return `${notification.source || "legacy"}:${notification.id}`;
}

async function loadSource(source: "legacy" | "v2", signal?: AbortSignal) {
    const notifications: VrchatNotification[] = [];
    for (let page = 0; page < 50; page += 1) {
        const response = await fetch(`/api/notifications?source=${source}&scope=center&offset=${page * 100}`, { cache: "no-store", signal });
        const payload = (await response.json()) as { error?: string; notifications?: VrchatNotification[] };
        if (!response.ok || !payload.notifications) throw new Error(payload.error || "Notification Center could not be loaded.");
        notifications.push(...payload.notifications);
        if (payload.notifications.length < 100) break;
    }
    return notifications;
}

function isExpired(notification: VrchatNotification) {
    if (!notification.expiresAt) return false;
    const value = typeof notification.expiresAt === "number" && notification.expiresAt < 1_000_000_000_000 ? notification.expiresAt * 1_000 : notification.expiresAt;
    const expiresAt = new Date(value).getTime();
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function relativeTime(notification: VrchatNotification) {
    const difference = Date.now() - notificationTimestamp(notification);
    if (!Number.isFinite(difference) || difference < 0) return "";
    const minutes = Math.floor(difference / 60_000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export function NotificationCenter({ layout, friends, openUser, openGroup }: { layout: "notification-center" | "table"; friends: VrchatUser[]; openUser: (userId: string) => void; openGroup: (groupId: string) => void }) {
    const [notifications, setNotifications] = useState<VrchatNotification[]>([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState<NotificationCategory>("friend");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [desktop, setDesktop] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const seenInFlight = useRef(new Set<string>());

    useEffect(() => {
        const query = window.matchMedia("(min-width: 1280px)");
        const updateDesktop = () => setDesktop(query.matches);
        updateDesktop();
        query.addEventListener("change", updateDesktop);
        return () => query.removeEventListener("change", updateDesktop);
    }, []);

    useEffect(() => {
        if (!contextMenu) return;
        const closeMenu = () => setContextMenu(null);
        const closeMenuOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeMenu();
        };
        window.addEventListener("pointerdown", closeMenu);
        window.addEventListener("keydown", closeMenuOnEscape);
        return () => {
            window.removeEventListener("pointerdown", closeMenu);
            window.removeEventListener("keydown", closeMenuOnEscape);
        };
    }, [contextMenu]);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        try {
            const [legacy, v2, settingsResponse] = await Promise.all([loadSource("legacy", signal), loadSource("v2", signal), fetch("/api/settings", { cache: "no-store", signal })]);
            const settings = (await settingsResponse.json()) as { notificationFilters?: string[] };
            const filters = settings.notificationFilters || [];
            const bySourceAndId = new Map<string, VrchatNotification>();
            for (const notification of [...legacy, ...v2]) {
                if (!filters.length || filters.includes(notification.type)) bySourceAndId.set(notificationKey(notification), notification);
            }
            setNotifications([...bySourceAndId.values()]);
            setError("");
        } catch (loadError) {
            if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Notification Center could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (layout !== "notification-center" || !desktop) return;
        const controller = new AbortController();
        void refresh(controller.signal);
        const interval = window.setInterval(() => void refresh(controller.signal), 10_000);
        return () => {
            controller.abort();
            window.clearInterval(interval);
        };
    }, [desktop, layout, refresh]);

    const projected = useMemo(() => splitNotificationCenter(notifications), [notifications]);
    const unseenCount = categories.reduce((count, category) => count + projected.unseen[category.value].length, 0);

    async function update(notification: VrchatNotification, method: "DELETE" | "POST", body: Record<string, unknown>) {
        const key = notificationKey(notification);
        setBusy((current) => new Set(current).add(key));
        setError("");
        try {
            const response = await fetch(`/api/notifications/${notification.id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The notification could not be updated.");
            await refresh();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The notification could not be updated.");
        } finally {
            setBusy((current) => {
                const next = new Set(current);
                next.delete(key);
                return next;
            });
        }
    }

    async function markSeen(rows: VrchatNotification[]) {
        const pending = rows.filter((notification) => notification.seen !== true && !seenInFlight.current.has(notificationKey(notification)));
        if (!pending.length) return;
        for (const notification of pending) seenInFlight.current.add(notificationKey(notification));
        const pendingKeys = new Set(pending.map(notificationKey));
        setNotifications((current) => current.map((notification) => (pendingKeys.has(notificationKey(notification)) ? { ...notification, seen: true } : notification)));
        try {
            for (const notification of pending) {
                const source = notification.source === "v2" ? "v2" : "legacy";
                const response = await fetch(`/api/notifications/${notification.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "see", source }) });
                if (!response.ok) throw new Error("Notifications could not be marked as seen.");
            }
        } catch (seenError) {
            setError(seenError instanceof Error ? seenError.message : "Notifications could not be marked as seen.");
        } finally {
            for (const notification of pending) seenInFlight.current.delete(notificationKey(notification));
            await refresh();
        }
    }

    function close(markCurrent = true) {
        if (markCurrent) void markSeen(projected.unseen[active]);
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    }

    function selectCategory(category: NotificationCategory) {
        if (category === active) return;
        void markSeen(projected.unseen[active]);
        setActive(category);
    }

    function openCenter() {
        const firstUnseen = categories.find((category) => projected.unseen[category.value].length)?.value;
        setActive(firstUnseen || "friend");
        setOpen(true);
        requestAnimationFrame(() => closeRef.current?.focus());
    }

    function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    if (layout === "table" || !desktop) return null;
    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={openCenter}
                onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 176), y: event.clientY });
                }}
                className="relative inline-flex size-8 items-center justify-center rounded-full hover:bg-accent"
                aria-label="Notification Center"
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <Bell className="size-4" />
                {unseenCount ? <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-red-500" aria-label={`${unseenCount} unseen notifications`} /> : null}
            </button>
            {contextMenu && typeof document !== "undefined"
                ? createPortal(
                      <div role="menu" aria-label="Notification Center actions" className="fixed z-[80] min-w-40 rounded-md border border-border bg-popover p-1 text-xs shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
                          <button
                              type="button"
                              role="menuitem"
                              disabled={!unseenCount}
                              onClick={() => {
                                  setContextMenu(null);
                                  void markSeen(categories.flatMap((category) => projected.unseen[category.value]));
                              }}
                              className="h-8 w-full rounded px-2 text-left hover:bg-muted disabled:text-muted-foreground"
                          >
                              {unseenCount ? "Mark all read" : "No unseen notifications"}
                          </button>
                      </div>,
                      document.body,
                  )
                : null}
            {open && typeof document !== "undefined"
                ? createPortal(
                      <>
                          <button type="button" className="fixed inset-0 z-[70] bg-black/45" aria-label="Close Notification Center" onClick={() => close()} />
                          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="notification-center-title" onKeyDown={trapFocus} className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col border-l border-border bg-popover px-1 shadow-2xl">
                              <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
                                  <h2 id="notification-center-title" className="text-base font-semibold">
                                      Notification Center
                                  </h2>
                                  {unseenCount ? (
                                      <button type="button" onClick={() => void markSeen(categories.flatMap((category) => projected.unseen[category.value]))} className="ml-auto h-7 rounded px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                                          Mark all read
                                      </button>
                                  ) : null}
                                  <button ref={closeRef} type="button" onClick={() => close()} className="ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close Notification Center">
                                      <X className="size-4" />
                                  </button>
                              </header>
                              <div className="mx-2 mt-2 grid shrink-0 grid-cols-3 rounded-md bg-muted p-1" role="tablist" aria-label="Notification categories">
                                  {categories.map((category) => (
                                      <button key={category.value} type="button" role="tab" aria-selected={active === category.value} onClick={() => selectCategory(category.value)} className={`h-8 rounded-sm text-xs ${active === category.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
                                          {category.label}
                                          {projected.unseen[category.value].length ? <span className="ml-1 text-[10px] text-muted-foreground">({projected.unseen[category.value].length})</span> : null}
                                      </button>
                                  ))}
                              </div>
                              {error ? <p className="mx-2 mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                              <NotificationList notifications={projected.unseen[active]} recent={projected.recent[active]} loading={loading} busy={busy} friends={friends} openUser={openUser} openGroup={openGroup} update={update} />
                              <div className="shrink-0 py-3 text-center">
                                  <Link href="/notification?fromCenter=1" onClick={() => close()} className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs text-secondary-foreground hover:brightness-110">
                                      View More
                                  </Link>
                              </div>
                          </div>
                      </>,
                      document.body,
                  )
                : null}
        </>
    );
}

function NotificationList({
    notifications,
    recent,
    loading,
    busy,
    friends,
    openUser,
    openGroup,
    update,
}: {
    notifications: VrchatNotification[];
    recent: VrchatNotification[];
    loading: boolean;
    busy: Set<string>;
    friends: VrchatUser[];
    openUser: (userId: string) => void;
    openGroup: (groupId: string) => void;
    update: (notification: VrchatNotification, method: "DELETE" | "POST", body: Record<string, unknown>) => Promise<void>;
}) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {loading ? <div className="h-16 animate-pulse rounded-md bg-muted" /> : null}
            {!loading && !notifications.length && !recent.length ? <p className="p-8 text-center text-sm text-muted-foreground">No new notifications</p> : null}
            {notifications.map((notification) => (
                <NotificationItem key={notificationKey(notification)} notification={notification} unseen busy={busy.has(notificationKey(notification))} friends={friends} openUser={openUser} openGroup={openGroup} update={update} />
            ))}
            {recent.length ? (
                <div className="flex items-center gap-2 px-2.5 py-2">
                    <span className="h-px flex-1 bg-border" />
                    <span className="shrink-0 text-[10px] tracking-wider text-muted-foreground uppercase">Past Notifications</span>
                    <span className="h-px flex-1 bg-border" />
                </div>
            ) : null}
            {recent.map((notification) => (
                <NotificationItem key={notificationKey(notification)} notification={notification} busy={busy.has(notificationKey(notification))} friends={friends} openUser={openUser} openGroup={openGroup} update={update} />
            ))}
        </div>
    );
}

function NotificationItem({
    notification,
    unseen = false,
    busy,
    friends,
    openUser,
    openGroup,
    update,
}: {
    notification: VrchatNotification;
    unseen?: boolean;
    busy: boolean;
    friends: VrchatUser[];
    openUser: (userId: string) => void;
    openGroup: (groupId: string) => void;
    update: (notification: VrchatNotification, method: "DELETE" | "POST", body: Record<string, unknown>) => Promise<void>;
}) {
    const details = notificationDetails(notification.details);
    const data = notification.data || {};
    const group = notification.type.startsWith("group.") || notification.type.startsWith("moderation.") || notification.type === "groupChange";
    const groupId = notification.senderUserId?.startsWith("grp_") ? notification.senderUserId : notificationText(data.groupId) || notificationText(details.groupId);
    const senderName = notification.title || notification.senderUsername || notificationText(data.groupName) || notification.groupName || notificationText(details.groupName) || notification.type;
    const message = notification.message || notificationText(details.inviteMessage) || notificationText(details.requestMessage) || notificationText(details.responseMessage) || notificationText(details.worldName);
    const friend = friends.find((item) => item.id === notification.senderUserId);
    const image = friend?.currentAvatarThumbnailImageUrl || notification.imageUrl || notificationText(details.imageUrl);
    const expired = isExpired(notification);
    const source = notification.source === "v2" ? "v2" : "legacy";
    const friendRequest = notification.type === "friendRequest" || notification.type === "ignoredFriendRequest";
    const canHide =
        !expired &&
        notification.type !== "requestInviteResponse" &&
        notification.type !== "inviteResponse" &&
        notification.type !== "message" &&
        notification.type !== "boop" &&
        notification.type !== "groupChange" &&
        !notification.type.includes("group.") &&
        !notification.type.includes("moderation.") &&
        !notification.type.includes("instance.") &&
        !notification.link?.startsWith("economy.");
    function openSender() {
        if (group && groupId) openGroup(groupId);
        else if (notification.senderUserId) openUser(notification.senderUserId);
    }
    return (
        <div className="mb-1.5 flex min-h-14 items-center gap-2 rounded-md bg-muted/60 p-2 text-xs">
            <button type="button" onClick={openSender} disabled={!groupId && !notification.senderUserId} className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background disabled:cursor-default" aria-label={`Open ${senderName}`}>
                <VrchatImage src={image} alt="" className="size-full object-cover" fallback={<NotificationTypeIcon type={notification.type} />} />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <button type="button" onClick={openSender} disabled={!groupId && !notification.senderUserId} className="min-w-0 truncate font-medium disabled:cursor-default">
                        {senderName}
                    </button>
                    <span className="shrink-0 rounded border border-border bg-background/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">{typeLabels[notification.type] || notification.type}</span>
                    {unseen ? <span className="ml-auto size-2 shrink-0 rounded-full bg-blue-500" /> : null}
                </div>
                {notification.type === "invite" && notificationText(details.worldName) ? <p className="truncate text-[11px] text-primary">{notificationText(details.worldName)}</p> : null}
                {message ? <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{message}</p> : null}
            </div>
            <div className="flex h-full shrink-0 flex-col items-end justify-between gap-1 self-stretch">
                <time className="text-[10px] text-muted-foreground" title={notificationTimestamp(notification) ? new Date(notificationTimestamp(notification)).toLocaleString() : undefined}>
                    {relativeTime(notification)}
                </time>
                <div className="flex items-center gap-0.5">
                    {!expired && friendRequest && source === "legacy" ? <ItemAction label="Accept" disabled={busy} action={() => void update(notification, "POST", { action: "accept", source })} icon={<Check className="size-3" />} /> : null}
                    {!expired && source === "v2"
                        ? notification.responses?.map((response) => {
                              const link = response.type === "link" ? safeExternalHttpUrl(response.data) : "";
                              const label = response.text || response.label || response.type;
                              return link ? (
                                  <a key={`${response.type}:${response.data || ""}`} href={link} target="_blank" rel="noreferrer" className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={label}>
                                      <ResponseIcon type={response.type} icon={response.icon} notificationType={notification.type} />
                                  </a>
                              ) : (
                                  <ItemAction
                                      key={`${response.type}:${response.data || ""}`}
                                      label={label}
                                      disabled={busy}
                                      action={() => void update(notification, "POST", { action: "respond", source, responseType: response.type, responseData: response.data || "" })}
                                      icon={<ResponseIcon type={response.type} icon={response.icon} notificationType={notification.type} />}
                                  />
                              );
                          })
                        : null}
                    {canHide ? (
                        <ItemAction
                            label="Decline"
                            disabled={busy}
                            action={() => {
                                if (window.confirm("Hide this notification?")) void update(notification, "POST", { action: "hide", source });
                            }}
                            icon={<X className="size-3" />}
                            destructive
                        />
                    ) : null}
                    {!friendRequest ? (
                        <ItemAction
                            label="Delete log"
                            disabled={busy}
                            action={() => {
                                if (window.confirm("Delete this notification log entry?")) void update(notification, "DELETE", { source: notification.source || "legacy" });
                            }}
                            icon={<Trash2 className="size-3" />}
                            destructive
                        />
                    ) : null}
                    {safeExternalHttpUrl(notification.link) ? (
                        <a href={safeExternalHttpUrl(notification.link)} target="_blank" rel="noreferrer" className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={notification.linkText || "Open notification link"}>
                            <ExternalLink className="size-3" />
                        </a>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function ItemAction({ label, disabled, action, icon, destructive = false }: { label: string; disabled: boolean; action: () => void; icon: React.ReactNode; destructive?: boolean }) {
    return (
        <button type="button" title={label} aria-label={label} disabled={disabled} onClick={action} className={`inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40 ${destructive ? "hover:text-destructive" : "hover:text-foreground"}`}>
            {icon}
        </button>
    );
}

function NotificationTypeIcon({ type }: { type: string }) {
    if (type === "friendRequest" || type === "ignoredFriendRequest") return <UserPlus className="size-4 text-muted-foreground" />;
    if (["invite", "requestInvite", "inviteResponse", "requestInviteResponse"].includes(type)) return <Send className="size-4 text-muted-foreground" />;
    if (type === "boop") return <MessageCircle className="size-4 text-muted-foreground" />;
    if (type === "message") return <Mail className="size-4 text-muted-foreground" />;
    if (type.startsWith("group.") || type.startsWith("moderation.") || type === "groupChange") return <Users className="size-4 text-muted-foreground" />;
    return <Bell className="size-4 text-muted-foreground" />;
}

function ResponseIcon({ type, icon, notificationType }: { type: string; icon?: string; notificationType: string }) {
    if (type === "link") return <LinkIcon className="size-3" />;
    if (icon === "check") return <Check className="size-3" />;
    if (icon === "cancel") return <X className="size-3" />;
    if (icon === "ban") return <Ban className="size-3" />;
    if (icon === "bell-slash") return <BellOff className="size-3" />;
    if (icon === "reply") return notificationType === "boop" ? <MessageCircle className="size-3" /> : <Reply className="size-3" />;
    return <Tag className="size-3" />;
}
