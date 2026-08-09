"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Bell, BellOff, Bookmark, BookmarkCheck, CalendarDays, Check, Clipboard, Ellipsis, ExternalLink, Eye, History, ImageIcon, Loader2, MessageCircle, MessageCircleOff, MessageSquare, RefreshCw, Repeat, Search, Share2, ShieldCheck, Star, Trash2, Users, X, XCircle } from "lucide-react";

import { FriendAvatar } from "@/components/friends/friend-avatar";
import { PreviousInstancesDialog } from "@/components/previous-instances/previous-instances-dialog";
import { VrchatImage } from "@/components/vrchat-image";
import { safeExternalHttpUrl } from "@/lib/browser-url";
import { locationLabel } from "@/lib/friends";
import { partitionGroupCalendarEvents } from "@/lib/group-calendar";
import type { VrchatGroup, VrchatGroupCalendarEvent, VrchatGroupCalendarInterestUpdate, VrchatGroupInstance, VrchatGroupMember, VrchatGroupPost, VrchatUser } from "@/lib/vrchat/types";

type GroupTab = "Info" | "Posts" | "Members" | "JSON";
type GroupActionName = "announcements" | "block" | "cancel-request" | "event-announcements" | "join" | "leave" | "representation" | "unblock" | "visibility";
type ConfirmAction = "block" | "leave";

function inGroup(group: VrchatGroup) {
    return group.membershipStatus === "member" || group.myMember?.membershipStatus === "member";
}

export function GroupDialog({ groupId, friends, openUser, onClose }: { groupId: string; friends: VrchatUser[]; openUser: (userId: string) => void; onClose: () => void }) {
    const [group, setGroup] = useState<VrchatGroup | null>(null);
    const [ownerName, setOwnerName] = useState("");
    const [tab, setTab] = useState<GroupTab>("Info");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [posts, setPosts] = useState<VrchatGroupPost[]>([]);
    const [instances, setInstances] = useState<VrchatGroupInstance[]>([]);
    const [instancesLoading, setInstancesLoading] = useState(false);
    const [calendar, setCalendar] = useState<VrchatGroupCalendarEvent[]>([]);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [followingEventId, setFollowingEventId] = useState("");
    const [members, setMembers] = useState<VrchatGroupMember[]>([]);
    const [hasMoreMembers, setHasMoreMembers] = useState(false);
    const [tabLoading, setTabLoading] = useState(false);
    const [postsLoaded, setPostsLoaded] = useState(false);
    const [membersLoaded, setMembersLoaded] = useState(false);
    const [search, setSearch] = useState("");
    const [actionLoading, setActionLoading] = useState<GroupActionName | "">("");
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [previousInstancesOpen, setPreviousInstancesOpen] = useState(false);
    const closeButton = useRef<HTMLButtonElement>(null);
    const previousInstancesButton = useRef<HTMLButtonElement>(null);

    const load = useCallback(
        async (refresh = false) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; group?: VrchatGroup };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.group) throw new Error(payload.error || "The group could not be loaded.");
                setGroup(payload.group);
                setOwnerName(payload.group.ownerId || "");
                if (payload.group.ownerId) {
                    void fetch(`/api/users/${encodeURIComponent(payload.group.ownerId)}`, { cache: "no-store" })
                        .then(async (ownerResponse) => (await ownerResponse.json()) as { user?: VrchatUser })
                        .then((ownerPayload) => setOwnerName(ownerPayload.user?.displayName || payload.group?.ownerId || ""))
                        .catch(() => undefined);
                }
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "The group could not be loaded.");
            } finally {
                setLoading(false);
            }
        },
        [groupId],
    );

    const loadPosts = useCallback(
        async (refresh = false) => {
            setTabLoading(true);
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/posts${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; posts?: VrchatGroupPost[] };
                if (!response.ok) throw new Error(payload.error || "Group posts could not be loaded.");
                setPosts(payload.posts || []);
                setPostsLoaded(true);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Group posts could not be loaded.");
            } finally {
                setTabLoading(false);
            }
        },
        [groupId],
    );

    const loadInstances = useCallback(
        async (refresh = false) => {
            setInstancesLoading(true);
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/instances${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; instances?: VrchatGroupInstance[] };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok) throw new Error(payload.error || "Group instances could not be loaded.");
                setInstances(payload.instances || []);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Group instances could not be loaded.");
            } finally {
                setInstancesLoading(false);
            }
        },
        [groupId],
    );

    const loadCalendar = useCallback(
        async (refresh = false) => {
            setCalendarLoading(true);
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/calendar${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; events?: VrchatGroupCalendarEvent[] };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok) throw new Error(payload.error || "Group calendar could not be loaded.");
                setCalendar(payload.events || []);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Group calendar could not be loaded.");
            } finally {
                setCalendarLoading(false);
            }
        },
        [groupId],
    );

    const loadMembers = useCallback(
        async (offset = 0, refresh = false) => {
            setTabLoading(true);
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members?offset=${offset}${refresh ? "&refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; members?: VrchatGroupMember[]; hasMore?: boolean };
                if (!response.ok) throw new Error(payload.error || "Group members could not be loaded.");
                setMembers((current) => (offset ? Array.from(new Map([...current, ...(payload.members || [])].map((member) => [member.userId, member])).values()) : payload.members || []));
                setHasMoreMembers(payload.hasMore === true);
                setMembersLoaded(true);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Group members could not be loaded.");
            } finally {
                setTabLoading(false);
            }
        },
        [groupId],
    );

    useEffect(() => {
        setGroup(null);
        setOwnerName("");
        setTab("Info");
        setPosts([]);
        setInstances([]);
        setCalendar([]);
        setMembers([]);
        setPostsLoaded(false);
        setMembersLoaded(false);
        setSearch("");
        setActionLoading("");
        setConfirmAction(null);
        setPreviousInstancesOpen(false);
        setFollowingEventId("");
        void Promise.all([load(), loadPosts(), loadInstances(), loadCalendar()]);
        closeButton.current?.focus();
    }, [load, loadCalendar, loadInstances, loadPosts]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    async function copy(value: string) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
    }

    async function runAction(action: GroupActionName, value?: boolean | string) {
        setActionLoading(action);
        setConfirmAction(null);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/actions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...(value === undefined ? {} : { value }) }),
            });
            const payload = (await response.json()) as { error?: string; group?: VrchatGroup; refreshRequired?: boolean };
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok) throw new Error(payload.error || "The group action could not be completed.");
            if (payload.group) setGroup(payload.group);
            if (!payload.group || payload.refreshRequired) await load(true);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The group action could not be completed.");
        } finally {
            setActionLoading("");
        }
    }

    async function followCalendarEvent(event: VrchatGroupCalendarEvent) {
        setFollowingEventId(event.id);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/calendar/${encodeURIComponent(event.id)}/follow`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isFollowing: !event.userInterest?.isFollowing }),
            });
            const payload = (await response.json()) as { error?: string; event?: VrchatGroupCalendarInterestUpdate };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.event) throw new Error(payload.error || "The calendar follow request could not be completed.");
            setCalendar((current) => current.map((item) => (item.id === payload.event?.id ? { ...item, userInterest: payload.event.userInterest } : item)));
        } catch (followError) {
            setError(followError instanceof Error ? followError.message : "The calendar follow request could not be completed.");
        } finally {
            setFollowingEventId("");
        }
    }

    const groupFriends = useMemo(() => friends.filter((friend) => friend.location?.includes(`~group(${groupId})`)), [friends, groupId]);
    return (
        <div className="fixed inset-0 z-[83] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close group details" />
            <section role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background p-3 shadow-2xl sm:h-[min(88dvh,780px)] sm:max-w-[892px] sm:rounded-xl sm:border sm:p-4">
                <button ref={closeButton} type="button" onClick={onClose} className="absolute top-2 right-2 z-40 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow hover:text-foreground" aria-label="Close">
                    <X className="size-4" />
                </button>
                {loading && !group ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Loading group…
                    </div>
                ) : null}
                {!loading && !group ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div> : null}
                {group ? (
                    <>
                        <header className="flex shrink-0 flex-col gap-3 pr-8 sm:flex-row sm:pr-10">
                            <div className="flex size-[120px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                <VrchatImage src={group.iconUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" fallback={<ImageIcon className="size-8 text-muted-foreground" />} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="group-dialog-title" className="break-words font-bold">
                                    {group.name}
                                </h2>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {group.shortCode || "GROUP"}
                                    {group.discriminator ? `.${group.discriminator}` : ""}
                                </p>
                                {group.ownerId ? (
                                    <button type="button" onClick={() => openUser(group.ownerId || "")} className="mt-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                                        {ownerName || group.ownerId}
                                    </button>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                    {group.isVerified ? <Badge icon={<ShieldCheck className="size-3" />}>Verified</Badge> : null}
                                    <Badge>{group.privacy === "default" ? "public" : group.privacy || "unknown"}</Badge>
                                    {group.joinState ? <Badge>{group.joinState}</Badge> : null}
                                    {group.membershipStatus === "member" || group.myMember?.membershipStatus === "member" ? <Badge>Joined</Badge> : null}
                                    {group.myMember?.visibility ? <Badge>{group.myMember.visibility}</Badge> : null}
                                    {group.myMember?.isSubscribedToAnnouncements ? <Badge>Subscribed</Badge> : null}
                                    {(group.languages || []).map((language) => (
                                        <Badge key={language}>{language.toUpperCase()}</Badge>
                                    ))}
                                </div>
                                {group.description && group.description !== group.name ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs">{group.description}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-end gap-2 sm:mt-12 sm:items-start">
                                <GroupPrimaryAction group={group} loading={actionLoading} runAction={runAction} />
                                <button
                                    type="button"
                                    onClick={() => void Promise.all([load(true), loadInstances(true), loadCalendar(true)])}
                                    disabled={loading || instancesLoading || calendarLoading}
                                    className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40"
                                    aria-label="Refresh group"
                                >
                                    <RefreshCw className={`size-4 ${loading || instancesLoading || calendarLoading ? "animate-spin" : ""}`} />
                                </button>
                                <button type="button" onClick={() => void copy(`https://vrchat.com/home/group/${group.id}`)} className="inline-flex h-9 items-center gap-1 rounded-full border border-input px-3 text-xs">
                                    <Clipboard className="size-4" /> {copied ? "Copied" : "Share"}
                                </button>
                                <a href={`https://vrchat.com/home/group/${encodeURIComponent(group.id)}`} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-full border border-input" aria-label="Open on VRChat">
                                    <ExternalLink className="size-4" />
                                </a>
                                <GroupManageMenu group={group} loading={actionLoading} runAction={runAction} confirm={setConfirmAction} />
                            </div>
                        </header>
                        {confirmAction ? <GroupActionConfirmation group={group} action={confirmAction} loading={actionLoading !== ""} cancel={() => setConfirmAction(null)} confirm={() => void runAction(confirmAction)} /> : null}
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Group details">
                            {(["Info", "Posts", "Members", "JSON"] as GroupTab[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === item}
                                    onClick={() => {
                                        setTab(item);
                                        setSearch("");
                                        setError("");
                                        if (item === "Posts" && !postsLoaded) void loadPosts();
                                        if (item === "Members" && !membersLoaded) void loadMembers();
                                    }}
                                    className={`h-10 flex-1 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tabLoading && tab !== "Info" ? (
                                <div className="flex min-h-48 items-center justify-center">
                                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : null}
                            {!tabLoading && tab === "Info" ? (
                                <GroupInfo
                                    group={group}
                                    friends={groupFriends}
                                    instances={instances}
                                    instancesLoading={instancesLoading}
                                    calendar={calendar}
                                    calendarLoading={calendarLoading}
                                    followingEventId={followingEventId}
                                    followCalendarEvent={followCalendarEvent}
                                    announcement={posts[0]}
                                    openUser={openUser}
                                    copy={copy}
                                    onOpenPreviousInstances={() => setPreviousInstancesOpen(true)}
                                    previousInstancesButton={previousInstancesButton}
                                />
                            ) : null}
                            {!tabLoading && tab === "Posts" ? <GroupPosts posts={posts} search={search} setSearch={setSearch} refresh={() => void loadPosts(true)} openUser={openUser} /> : null}
                            {!tabLoading && tab === "Members" ? <GroupMembers group={group} members={members} search={search} setSearch={setSearch} refresh={() => void loadMembers(0, true)} loadMore={() => void loadMembers(members.length, true)} hasMore={hasMoreMembers} openUser={openUser} /> : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(group, null, 2)}</pre> : null}
                        </div>
                    </>
                ) : null}
            </section>
            {previousInstancesOpen && group ? <PreviousInstancesDialog variant="group" entityId={group.id} label={group.name} onClose={() => setPreviousInstancesOpen(false)} returnFocusRef={previousInstancesButton} /> : null}
        </div>
    );
}

function GroupPrimaryAction({ group, loading, runAction }: { group: VrchatGroup; loading: GroupActionName | ""; runAction: (action: GroupActionName, value?: boolean | string) => Promise<void> }) {
    const busy = loading !== "";
    if (inGroup(group) && group.myMember) {
        const representing = group.myMember.isRepresenting === true;
        return (
            <button
                type="button"
                onClick={() => void runAction("representation", !representing)}
                disabled={busy || (!representing && group.privacy === "private")}
                className={`inline-flex size-9 items-center justify-center rounded-full border disabled:opacity-40 ${representing ? "border-primary bg-primary/15 text-primary" : "border-input hover:bg-muted"}`}
                aria-label={representing ? "Stop representing group" : "Represent group"}
            >
                {loading === "representation" ? <Loader2 className="size-4 animate-spin" /> : representing ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
            </button>
        );
    }

    if (group.myMember?.membershipStatus === "requested") {
        return (
            <button type="button" onClick={() => void runAction("cancel-request")} disabled={busy} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40" aria-label="Cancel join request">
                {loading === "cancel-request" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </button>
        );
    }

    const canJoin = group.myMember?.membershipStatus === "invited" || group.joinState === "open" || group.joinState === "request";
    if (!canJoin) return null;
    const requested = group.joinState === "request" && group.myMember?.membershipStatus !== "invited";
    return (
        <button type="button" onClick={() => void runAction("join")} disabled={busy} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40" aria-label={requested ? "Request to join group" : "Join group"}>
            {loading === "join" ? <Loader2 className="size-4 animate-spin" /> : requested ? <MessageSquare className="size-4" /> : <Check className="size-4" />}
        </button>
    );
}

function GroupManageMenu({ group, loading, runAction, confirm }: { group: VrchatGroup; loading: GroupActionName | ""; runAction: (action: GroupActionName, value?: boolean | string) => Promise<void>; confirm: (action: ConfirmAction) => void }) {
    const member = inGroup(group) && group.myMember;
    const closeAndRun = (event: React.MouseEvent<HTMLButtonElement>, action: () => void) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        action();
    };
    return (
        <details className="relative">
            <summary className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-input hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Manage group">
                <Ellipsis className="size-4" />
            </summary>
            <div className="absolute top-10 right-0 z-40 max-h-[min(28rem,70dvh)] w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-xs shadow-xl">
                {member ? (
                    <>
                        <GroupMenuButton
                            icon={group.myMember?.isSubscribedToAnnouncements ? <BellOff /> : <Bell />}
                            label={group.myMember?.isSubscribedToAnnouncements ? "Unsubscribe from announcements" : "Subscribe to announcements"}
                            disabled={loading !== ""}
                            action={(event) => closeAndRun(event, () => void runAction("announcements", !group.myMember?.isSubscribedToAnnouncements))}
                        />
                        <GroupMenuButton
                            icon={group.myMember?.isSubscribedToEventAnnouncements === false ? <MessageCircle /> : <MessageCircleOff />}
                            label={group.myMember?.isSubscribedToEventAnnouncements === false ? "Subscribe to event announcements" : "Unsubscribe from event announcements"}
                            disabled={loading !== ""}
                            action={(event) => closeAndRun(event, () => void runAction("event-announcements", group.myMember?.isSubscribedToEventAnnouncements === false))}
                        />
                        {group.privacy === "default" ? (
                            <>
                                <hr className="my-1 border-border" />
                                <GroupMenuButton icon={<Eye />} label="Visibility: Everyone" selected={group.myMember?.visibility === "visible"} disabled={loading !== ""} action={(event) => closeAndRun(event, () => void runAction("visibility", "visible"))} />
                                <GroupMenuButton icon={<Eye />} label="Visibility: Friends" selected={group.myMember?.visibility === "friends"} disabled={loading !== ""} action={(event) => closeAndRun(event, () => void runAction("visibility", "friends"))} />
                                <GroupMenuButton icon={<Eye />} label="Visibility: Hidden" selected={group.myMember?.visibility === "hidden"} disabled={loading !== ""} action={(event) => closeAndRun(event, () => void runAction("visibility", "hidden"))} />
                            </>
                        ) : null}
                        <hr className="my-1 border-border" />
                        <GroupMenuButton icon={<Trash2 />} label="Leave group" destructive disabled={loading !== ""} action={(event) => closeAndRun(event, () => confirm("leave"))} />
                    </>
                ) : group.membershipStatus === "userblocked" || group.myMember?.membershipStatus === "userblocked" ? (
                    <GroupMenuButton icon={<Check />} label="Unblock group" disabled={loading !== ""} action={(event) => closeAndRun(event, () => void runAction("unblock"))} />
                ) : (
                    <GroupMenuButton icon={<XCircle />} label="Block group" destructive disabled={loading !== ""} action={(event) => closeAndRun(event, () => confirm("block"))} />
                )}
            </div>
        </details>
    );
}

function GroupMenuButton({ icon, label, action, disabled = false, destructive = false, selected = false }: { icon: React.ReactNode; label: string; action: (event: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; destructive?: boolean; selected?: boolean }) {
    return (
        <button type="button" onClick={action} disabled={disabled} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-40 ${destructive ? "text-destructive" : ""}`}>
            <span className="[&>svg]:size-4">{icon}</span>
            <span className="min-w-0 flex-1">{label}</span>
            {selected ? <Check className="size-4" /> : null}
        </button>
    );
}

function GroupActionConfirmation({ group, action, loading, cancel, confirm }: { group: VrchatGroup; action: ConfirmAction; loading: boolean; cancel: () => void; confirm: () => void }) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="group-action-title" className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h3 id="group-action-title" className="font-semibold">
                    {action === "leave" ? "Leave group?" : "Block group?"}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">{action === "leave" ? `Leave ${group.name}?` : `Block ${group.name}? You will no longer receive this group's content.`}</p>
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={cancel} disabled={loading} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                        Cancel
                    </button>
                    <button type="button" onClick={confirm} disabled={loading} className="inline-flex h-9 items-center gap-1 rounded-md bg-destructive px-4 text-xs text-white disabled:opacity-40">
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {action === "leave" ? "Leave" : "Block"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function GroupInfo({
    group,
    friends,
    instances,
    instancesLoading,
    calendar,
    calendarLoading,
    followingEventId,
    followCalendarEvent,
    announcement,
    openUser,
    copy,
    onOpenPreviousInstances,
    previousInstancesButton,
}: {
    group: VrchatGroup;
    friends: VrchatUser[];
    instances: VrchatGroupInstance[];
    instancesLoading: boolean;
    calendar: VrchatGroupCalendarEvent[];
    calendarLoading: boolean;
    followingEventId: string;
    followCalendarEvent: (event: VrchatGroupCalendarEvent) => Promise<void>;
    announcement?: VrchatGroupPost;
    openUser: (userId: string) => void;
    copy: (value: string) => Promise<void>;
    onOpenPreviousInstances: () => void;
    previousInstancesButton: React.RefObject<HTMLButtonElement | null>;
}) {
    const rooms = new Map<string, { instance?: VrchatGroupInstance; users: VrchatUser[] }>();
    for (const instance of instances) rooms.set(instance.location, { instance, users: [] });
    for (const friend of friends) {
        if (!friend.location) continue;
        const room = rooms.get(friend.location) || { users: [] };
        room.users.push(friend);
        rooms.set(friend.location, room);
    }
    const visibleRooms = Array.from(rooms, ([location, room]) => ({ location, ...room })).toSorted((a, b) => b.users.length - a.users.length || (b.instance?.userCount || 0) - (a.instance?.userCount || 0) || a.location.localeCompare(b.location));
    const links = (group.links || []).map((link) => safeExternalHttpUrl(link)).filter(Boolean);
    return (
        <div>
            <VrchatImage
                src={group.bannerUrl}
                alt=""
                className="aspect-[6/1] w-full rounded-md object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                fallback={
                    <div className="flex aspect-[6/1] w-full items-center justify-center rounded-md bg-muted">
                        <ImageIcon className="size-8 text-muted-foreground" />
                    </div>
                }
            />
            {instancesLoading && !visibleRooms.length ? (
                <div className="mt-3 flex items-center gap-2 px-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading instances…
                </div>
            ) : null}
            {visibleRooms.length ? (
                <section className="mt-3">
                    <h3 className="px-1.5 text-xs font-bold">Instances</h3>
                    {visibleRooms.map((room) => (
                        <div key={room.location} className="mt-1.5 w-full">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground" title={room.location}>
                                    {room.instance?.world.name || locationLabel(room.users[0])}
                                    {room.instance?.displayName ? ` · #${room.instance.displayName}` : ""}
                                </span>
                                {room.instance?.userCount ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground" title="Remote player count">
                                        <Users className="size-3.5" /> {room.instance.userCount}/{room.instance.capacity ?? "—"}
                                    </span>
                                ) : null}
                                {room.users.length ? (
                                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                        {room.users.length} friend{room.users.length === 1 ? "" : "s"}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap">
                                {room.users.map((friend) => (
                                    <button key={friend.id} type="button" onClick={() => openUser(friend.id)} className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                                        <FriendAvatar friend={friend} size="sm" />
                                        <span className="min-w-0 truncate font-medium">{friend.displayName}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}
            <div className="mt-3 flex flex-wrap items-start px-1">
                <FullInfo label="Announcement" value={announcement ? `${announcement.title}${announcement.text ? `\n${announcement.text}` : ""}` : "—"} />
                <FullInfo label="Rules" value={group.rules || "—"} />
            </div>
            <GroupCalendar events={calendar} loading={calendarLoading} followingEventId={followingEventId} follow={followCalendarEvent} />
            <div className="flex flex-wrap items-start px-1">
                <Info label="Members" value={`${number(group.memberCount)} (${number(group.onlineMemberCount)})`} icon={<Users className="size-3.5" />} />
                <Info label="Created" value={date(group.createdAt)} />
                <button ref={previousInstancesButton} type="button" onClick={onOpenPreviousInstances} aria-label="Previous Instances" className="box-border w-[167px] rounded p-1.5 text-left text-[13px] hover:bg-muted">
                    <span className="flex items-center gap-1 font-medium leading-[18px]">
                        <History className="size-3.5" /> Previous Instances
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">Remote visit history</span>
                </button>
                <Info label="Join state" value={group.joinState || "—"} />
                <Info label="Privacy" value={group.privacy === "default" ? "public" : group.privacy || "—"} />
                <Info label="Roles" value={number(group.roles?.length)} />
                <FullInfo label="Links" value={links.join("\n") || "—"} links={links} />
                <Info label="URL" value={`https://vrchat.com/home/group/${group.id}`} action={() => void copy(`https://vrchat.com/home/group/${group.id}`)} />
                <Info label="Group ID" value={group.id} action={() => void copy(group.id)} />
            </div>
            {group.roles?.length ? (
                <section className="mt-3 px-2 text-xs">
                    <h3 className="font-medium">Roles</h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.roles.map((role) => (
                            <Badge key={role.id}>{role.name}</Badge>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function GroupCalendar({ events, loading, followingEventId, follow }: { events: VrchatGroupCalendarEvent[]; loading: boolean; followingEventId: string; follow: (event: VrchatGroupCalendarEvent) => Promise<void> }) {
    const { past, upcoming } = partitionGroupCalendarEvents(events);
    return (
        <div className="px-2 pb-2 text-[13px]">
            <h3 className="font-medium leading-[18px]">Upcoming Events</h3>
            {loading && !events.length ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading calendar…
                </div>
            ) : upcoming.length ? (
                <div className="mt-2 flex max-h-[360px] flex-wrap gap-4 overflow-y-auto py-1">
                    {upcoming.map((event) => (
                        <GroupCalendarCard key={event.id} event={event} following={followingEventId === event.id} follow={follow} />
                    ))}
                </div>
            ) : (
                <span className="block text-xs">—</span>
            )}
            {past.length ? (
                <>
                    <h3 className="mt-3 font-medium leading-[18px]">Past Events</h3>
                    <div className="mt-2 flex max-h-[360px] flex-wrap gap-4 overflow-y-auto py-1">
                        {past.map((event) => (
                            <GroupCalendarCard key={event.id} event={event} following={followingEventId === event.id} follow={follow} />
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}

function GroupCalendarCard({ event, following, follow }: { event: VrchatGroupCalendarEvent; following: boolean; follow: (event: VrchatGroupCalendarEvent) => Promise<void> }) {
    const link = `https://vrchat.com/home/group/${event.ownerId}/calendar/${event.id}`;
    const [linkCopied, setLinkCopied] = useState(false);
    async function copyLink() {
        await navigator.clipboard.writeText(link);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1_500);
    }
    return (
        <article className="relative w-full max-w-[320px] overflow-hidden rounded-lg border border-border bg-card hover:bg-accent">
            <VrchatImage
                src={event.imageUrl}
                alt=""
                className="h-[100px] w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                fallback={
                    <div className="flex h-[100px] w-full items-center justify-center bg-muted">
                        <CalendarDays className="size-6 text-muted-foreground" />
                    </div>
                }
            />
            <div className="absolute top-1 right-1 flex gap-1.5">
                <button type="button" onClick={() => void copyLink()} className="inline-flex size-6 items-center justify-center rounded-full bg-secondary shadow" aria-label={`Copy event link for ${event.title}`}>
                    {linkCopied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
                </button>
                <button
                    type="button"
                    onClick={() => void follow(event)}
                    disabled={following}
                    className={`inline-flex size-6 items-center justify-center rounded-full shadow disabled:opacity-50 ${event.userInterest?.isFollowing ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                    aria-label={`${event.userInterest?.isFollowing ? "Unfollow" : "Follow"} ${event.title}`}
                >
                    {following ? <Loader2 className="size-3.5 animate-spin" /> : <Star className={`size-3.5 ${event.userInterest?.isFollowing ? "fill-current" : ""}`} />}
                </button>
            </div>
            <details className="group/event px-3 pt-2 pb-3">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <p className="text-sm font-bold leading-tight">
                        {event.seriesId ? <Repeat className="mr-1 inline size-4" /> : null}
                        {event.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-medium">{eventRange(event)}</span>
                        <span className="capitalize">{event.accessType}</span>
                    </div>
                </summary>
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
                    <p>{event.description || "—"}</p>
                    <p className="text-muted-foreground">
                        {event.category} · {event.interestedUserCount} interested
                    </p>
                </div>
            </details>
        </article>
    );
}

function eventRange(event: VrchatGroupCalendarEvent) {
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return `${event.startsAt} – ${event.endsAt}`;
    const date = new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(startsAt);
    const time = new Intl.DateTimeFormat("en", { timeStyle: "short" });
    return `${date} ${time.format(startsAt)} – ${time.format(endsAt)}`;
}

function GroupPosts({ posts, search, setSearch, refresh, openUser }: { posts: VrchatGroupPost[]; search: string; setSearch: (value: string) => void; refresh: () => void; openUser: (userId: string) => void }) {
    const query = search.trim().toLocaleLowerCase();
    const visible = posts.filter((post) => !query || `${post.title} ${post.text}`.toLocaleLowerCase().includes(query));
    return (
        <div>
            <TabToolbar count={posts.length} value={search} setValue={setSearch} refresh={refresh} placeholder="Search posts" />
            <div className="space-y-1">
                {visible.map((post) => (
                    <article key={post.id} className="rounded-lg p-2 text-[13px] hover:bg-background">
                        <p className="font-medium">{post.title || "Untitled post"}</p>
                        <div className="mt-1 flex items-start gap-2">
                            <VrchatImage src={post.imageUrl} alt="" className="size-[60px] shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
                            <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs">{post.text || "—"}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap justify-end gap-2 text-[10px] text-muted-foreground">
                            {post.authorId ? (
                                <button type="button" onClick={() => openUser(post.authorId || "")} className="hover:text-foreground">
                                    {post.authorId}
                                </button>
                            ) : null}
                            <span>{dateTime(post.updatedAt || post.createdAt)}</span>
                        </div>
                    </article>
                ))}
            </div>
            {!visible.length ? <EmptyState>No group posts.</EmptyState> : null}
        </div>
    );
}

function GroupMembers({ group, members, search, setSearch, refresh, loadMore, hasMore, openUser }: { group: VrchatGroup; members: VrchatGroupMember[]; search: string; setSearch: (value: string) => void; refresh: () => void; loadMore: () => void; hasMore: boolean; openUser: (userId: string) => void }) {
    const query = search.trim().toLocaleLowerCase();
    const roleNames = new Map((group.roles || []).map((role) => [role.id, role.name]));
    const visible = members.filter((member) => !query || `${member.user?.displayName || member.userId} ${member.roleIds.map((id) => roleNames.get(id) || id).join(" ")}`.toLocaleLowerCase().includes(query));
    return (
        <div>
            <TabToolbar count={members.length} total={group.memberCount} value={search} setValue={setSearch} refresh={refresh} placeholder="Search loaded members" />
            <div className="flex flex-wrap items-start">
                {visible.map((member) => {
                    const user = member.user || { id: member.userId, displayName: member.userId };
                    return (
                        <button key={member.userId} type="button" onClick={() => openUser(member.userId)} className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                            <FriendAvatar friend={user} size="sm" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{user.displayName}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">{member.roleIds.map((id) => roleNames.get(id) || id).join(", ") || date(member.joinedAt)}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {!visible.length ? <EmptyState>No group members available.</EmptyState> : null}
            {hasMore && !search ? (
                <button type="button" onClick={loadMore} className="mt-2 h-9 w-full rounded-md border border-input text-xs hover:bg-muted">
                    Load more members
                </button>
            ) : null}
        </div>
    );
}

function TabToolbar({ count, total, value, setValue, refresh, placeholder }: { count: number; total?: number; value: string; setValue: (value: string) => void; refresh: () => void; placeholder: string }) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={refresh} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Refresh">
                <RefreshCw className="size-4" />
            </button>
            <span className="text-xs text-muted-foreground">
                {count}
                {total !== undefined ? ` / ${total}` : ""}
            </span>
            <label className="relative min-w-44 flex-1">
                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="h-8 w-full rounded-md border border-input bg-transparent pr-3 pl-8 text-xs outline-none focus:border-ring" />
            </label>
        </div>
    );
}

function EmptyState({ children }: { children: React.ReactNode }) {
    return <div className="flex min-h-40 items-center justify-center text-xs text-muted-foreground">{children}</div>;
}

function Badge({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 capitalize">
            {icon}
            {children}
        </span>
    );
}

function Info({ label, value, icon, action }: { label: string; value: string; icon?: React.ReactNode; action?: () => void }) {
    const content = (
        <>
            <span className="flex items-center gap-1 truncate font-medium leading-[18px]">
                {icon}
                {label}
            </span>
            <span className="block truncate text-xs">{value}</span>
        </>
    );
    return action ? (
        <button type="button" onClick={action} className="box-border w-[167px] p-1.5 text-left text-[13px] hover:rounded hover:bg-muted">
            {content}
        </button>
    ) : (
        <div className="box-border w-[167px] p-1.5 text-[13px]">{content}</div>
    );
}

function FullInfo({ label, value, links }: { label: string; value: string; links?: string[] }) {
    return (
        <div className="box-border w-full p-1.5 text-[13px]">
            <span className="block font-medium leading-[18px]">{label}</span>
            {links?.length ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {links.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer" className="max-w-full truncate text-xs text-primary hover:underline">
                            {link}
                        </a>
                    ))}
                </div>
            ) : (
                <span className="block whitespace-pre-wrap text-xs">{value}</span>
            )}
        </div>
    );
}

function number(value?: number) {
    return value === undefined ? "—" : new Intl.NumberFormat("en").format(value);
}

function date(value?: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}

function dateTime(value?: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
