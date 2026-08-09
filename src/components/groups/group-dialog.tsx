"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    Bell,
    BellOff,
    Bookmark,
    BookmarkCheck,
    CalendarDays,
    Check,
    Clipboard,
    Download,
    Ellipsis,
    ExternalLink,
    Eye,
    History,
    ImageIcon,
    Loader2,
    MessageCircle,
    MessageCircleOff,
    MessageSquare,
    Pencil,
    Plus,
    RefreshCw,
    Repeat,
    Search,
    Share2,
    ShieldCheck,
    Star,
    Trash2,
    Upload,
    Users,
    X,
    XCircle,
} from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FriendAvatar } from "@/components/friends/friend-avatar";
import { PreviousInstancesDialog } from "@/components/previous-instances/previous-instances-dialog";
import { VrchatImage } from "@/components/vrchat-image";
import { safeExternalHttpUrl } from "@/lib/browser-url";
import { locationLabel } from "@/lib/friends";
import { partitionGroupCalendarEvents } from "@/lib/group-calendar";
import { latestVrchatFileUrl } from "@/lib/vrchat/gallery-files";
import type { VrchatFile, VrchatGroup, VrchatGroupCalendarEvent, VrchatGroupCalendarInterestUpdate, VrchatGroupGallery, VrchatGroupGalleryImage, VrchatGroupInstance, VrchatGroupMember, VrchatGroupPost, VrchatUser } from "@/lib/vrchat/types";

type GroupTab = "Info" | "Posts" | "Members" | "Photos" | "JSON";
type GroupActionName = "announcements" | "block" | "cancel-request" | "event-announcements" | "join" | "leave" | "representation" | "unblock" | "visibility";
type ConfirmAction = "block" | "leave";
type GroupPostInput = {
    title: string;
    text: string;
    roleIds: string[];
    visibility: "group" | "public";
    imageId: string | null;
    sendNotification: boolean;
};

function inGroup(group: VrchatGroup) {
    return group.membershipStatus === "member" || group.myMember?.membershipStatus === "member";
}

function canManageGroupPosts(group: VrchatGroup) {
    const permissions = group.myMember?.permissions || [];
    return permissions.includes("*") || permissions.includes("group-announcement-manage");
}

export function GroupDialog({ groupId, friends, openUser, onClose }: { groupId: string; friends: VrchatUser[]; openUser: (userId: string) => void; onClose: () => void }) {
    const currentUser = useCurrentUser();
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
    const [galleries, setGalleries] = useState<VrchatGroupGallery[]>([]);
    const [galleryImages, setGalleryImages] = useState<VrchatGroupGalleryImage[]>([]);
    const [truncatedGalleryIds, setTruncatedGalleryIds] = useState<string[]>([]);
    const [galleriesLoading, setGalleriesLoading] = useState(false);
    const [galleriesLoaded, setGalleriesLoaded] = useState(false);
    const [members, setMembers] = useState<VrchatGroupMember[]>([]);
    const [hasMoreMembers, setHasMoreMembers] = useState(false);
    const [tabLoading, setTabLoading] = useState(false);
    const [postsLoaded, setPostsLoaded] = useState(false);
    const [membersLoaded, setMembersLoaded] = useState(false);
    const [search, setSearch] = useState("");
    const [actionLoading, setActionLoading] = useState<GroupActionName | "">("");
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [previousInstancesOpen, setPreviousInstancesOpen] = useState(false);
    const [postEditor, setPostEditor] = useState<VrchatGroupPost | "new" | null>(null);
    const [postToDelete, setPostToDelete] = useState<VrchatGroupPost | null>(null);
    const [postMutationLoading, setPostMutationLoading] = useState(false);
    const closeButton = useRef<HTMLButtonElement>(null);
    const previousInstancesButton = useRef<HTMLButtonElement>(null);
    const postActionReturnFocus = useRef<HTMLElement | null>(null);

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

    const loadGalleries = useCallback(
        async (refresh = false) => {
            setGalleriesLoading(true);
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/galleries${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; galleries?: VrchatGroupGallery[]; images?: VrchatGroupGalleryImage[]; truncatedGalleryIds?: string[] };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok) throw new Error(payload.error || "Group photos could not be loaded.");
                setGalleries(payload.galleries || []);
                setGalleryImages(payload.images || []);
                setTruncatedGalleryIds(payload.truncatedGalleryIds || []);
                setGalleriesLoaded(true);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Group photos could not be loaded.");
            } finally {
                setGalleriesLoading(false);
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
        setGalleries([]);
        setGalleryImages([]);
        setTruncatedGalleryIds([]);
        setMembers([]);
        setPostsLoaded(false);
        setMembersLoaded(false);
        setSearch("");
        setActionLoading("");
        setConfirmAction(null);
        setPreviousInstancesOpen(false);
        setFollowingEventId("");
        setGalleriesLoaded(false);
        setPostEditor(null);
        setPostToDelete(null);
        setPostMutationLoading(false);
        void Promise.all([load(), loadPosts(), loadInstances(), loadCalendar()]);
        closeButton.current?.focus();
    }, [load, loadCalendar, loadInstances, loadPosts]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape" && !document.querySelector("[data-group-post-overlay]")) onClose();
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

    function openPostEditor(post: VrchatGroupPost | "new", trigger: HTMLElement) {
        postActionReturnFocus.current = trigger;
        setPostEditor(post);
        setError("");
    }

    function closePostOverlay() {
        setPostEditor(null);
        setPostToDelete(null);
        setError("");
        window.setTimeout(() => postActionReturnFocus.current?.focus(), 0);
    }

    async function savePost(input: GroupPostInput) {
        if (!postEditor) return;
        setPostMutationLoading(true);
        setError("");
        try {
            const editing = postEditor !== "new";
            const endpoint = editing ? `/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postEditor.id)}` : `/api/groups/${encodeURIComponent(groupId)}/posts`;
            const { sendNotification, ...editable } = input;
            const response = await fetch(endpoint, {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editing ? editable : { ...editable, sendNotification }),
            });
            const payload = (await response.json()) as { error?: string; post?: VrchatGroupPost; refreshRequired?: boolean };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.post) throw new Error(payload.error || "The group post could not be saved.");
            setPosts((current) => {
                const existing = current.some((post) => post.id === payload.post?.id);
                return existing ? current.map((post) => (post.id === payload.post?.id ? payload.post : post)) : [payload.post as VrchatGroupPost, ...current];
            });
            setPostsLoaded(true);
            closePostOverlay();
            if (payload.refreshRequired) void loadPosts(true);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "The group post could not be saved.");
        } finally {
            setPostMutationLoading(false);
        }
    }

    async function deletePost() {
        if (!postToDelete) return;
        setPostMutationLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postToDelete.id)}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string; success?: boolean; refreshRequired?: boolean };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.success) throw new Error(payload.error || "The group post could not be deleted.");
            setPosts((current) => current.filter((post) => post.id !== postToDelete.id));
            closePostOverlay();
            if (payload.refreshRequired) void loadPosts(true);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "The group post could not be deleted.");
        } finally {
            setPostMutationLoading(false);
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
                                <GroupManageMenu group={group} loading={actionLoading} runAction={runAction} confirm={setConfirmAction} createPost={(trigger) => openPostEditor("new", trigger)} />
                            </div>
                        </header>
                        {confirmAction ? <GroupActionConfirmation group={group} action={confirmAction} loading={actionLoading !== ""} cancel={() => setConfirmAction(null)} confirm={() => void runAction(confirmAction)} /> : null}
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Group details">
                            {(["Info", "Posts", "Members", "Photos", "JSON"] as GroupTab[]).map((item) => (
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
                                        if (item === "Photos" && !galleriesLoaded) void loadGalleries();
                                    }}
                                    className={`h-10 flex-1 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tabLoading && (tab === "Posts" || tab === "Members") ? (
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
                                    canManagePosts={canManageGroupPosts(group)}
                                    editPost={openPostEditor}
                                    deletePost={(post, trigger) => {
                                        postActionReturnFocus.current = trigger;
                                        setError("");
                                        setPostToDelete(post);
                                    }}
                                    openUser={openUser}
                                    copy={copy}
                                    onOpenPreviousInstances={() => setPreviousInstancesOpen(true)}
                                    previousInstancesButton={previousInstancesButton}
                                />
                            ) : null}
                            {!tabLoading && tab === "Posts" ? (
                                <GroupPosts
                                    posts={posts}
                                    group={group}
                                    search={search}
                                    setSearch={setSearch}
                                    refresh={() => void loadPosts(true)}
                                    openUser={openUser}
                                    editPost={openPostEditor}
                                    deletePost={(post, trigger) => {
                                        postActionReturnFocus.current = trigger;
                                        setError("");
                                        setPostToDelete(post);
                                    }}
                                />
                            ) : null}
                            {!tabLoading && tab === "Members" ? <GroupMembers group={group} members={members} search={search} setSearch={setSearch} refresh={() => void loadMembers(0, true)} loadMore={() => void loadMembers(members.length, true)} hasMore={hasMoreMembers} openUser={openUser} /> : null}
                            {tab === "Photos" ? <GroupPhotos galleries={galleries} images={galleryImages} truncatedGalleryIds={truncatedGalleryIds} loading={galleriesLoading} refresh={() => void loadGalleries(true)} /> : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(group, null, 2)}</pre> : null}
                        </div>
                    </>
                ) : null}
            </section>
            {previousInstancesOpen && group ? <PreviousInstancesDialog variant="group" entityId={group.id} label={group.name} onClose={() => setPreviousInstancesOpen(false)} returnFocusRef={previousInstancesButton} /> : null}
            {postEditor && group ? <GroupPostEditor group={group} post={postEditor === "new" ? undefined : postEditor} vrcPlus={currentUser.tags?.includes("system_supporter") === true} loading={postMutationLoading} error={error} cancel={closePostOverlay} save={savePost} /> : null}
            {postToDelete ? <GroupPostDeleteConfirmation post={postToDelete} loading={postMutationLoading} error={error} cancel={closePostOverlay} confirm={() => void deletePost()} /> : null}
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

function GroupManageMenu({ group, loading, runAction, confirm, createPost }: { group: VrchatGroup; loading: GroupActionName | ""; runAction: (action: GroupActionName, value?: boolean | string) => Promise<void>; confirm: (action: ConfirmAction) => void; createPost: (trigger: HTMLElement) => void }) {
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
                        {canManageGroupPosts(group) ? (
                            <GroupMenuButton
                                icon={<Plus />}
                                label="Create Post"
                                disabled={loading !== ""}
                                action={(event) => {
                                    const returnFocus = event.currentTarget.closest("details")?.querySelector<HTMLElement>("summary") || event.currentTarget;
                                    closeAndRun(event, () => createPost(returnFocus));
                                }}
                            />
                        ) : null}
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
    canManagePosts,
    editPost,
    deletePost,
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
    canManagePosts: boolean;
    editPost: (post: VrchatGroupPost, trigger: HTMLButtonElement) => void;
    deletePost: (post: VrchatGroupPost, trigger: HTMLButtonElement) => void;
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
                <div className="box-border w-full p-1.5 text-[13px]">
                    <span className="block font-medium leading-[18px]">Announcement</span>
                    {announcement ? (
                        <div className="text-xs">
                            <p>{announcement.title}</p>
                            <p className="mt-1 whitespace-pre-wrap">{announcement.text || "—"}</p>
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                                <span>{dateTime(announcement.updatedAt || announcement.createdAt)}</span>
                                {canManagePosts ? (
                                    <>
                                        <button type="button" onClick={(event) => editPost(announcement, event.currentTarget)} className="inline-flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground" aria-label="Edit post">
                                            <Pencil className="size-3.5" />
                                        </button>
                                        <button type="button" onClick={(event) => deletePost(announcement, event.currentTarget)} className="inline-flex size-6 items-center justify-center rounded hover:bg-muted hover:text-destructive" aria-label="Delete post">
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <span className="text-xs">—</span>
                    )}
                </div>
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
    const [downloadingIcs, setDownloadingIcs] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    async function copyLink() {
        await navigator.clipboard.writeText(link);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1_500);
    }
    async function downloadIcs() {
        setDownloadingIcs(true);
        setDownloadError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(event.ownerId)}/calendar/${encodeURIComponent(event.id)}/ics`, { cache: "no-store" });
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(payload?.error || "The calendar file could not be downloaded.");
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `${event.id}.ics`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            setDownloadError(error instanceof Error ? error.message : "The calendar file could not be downloaded.");
        } finally {
            setDownloadingIcs(false);
        }
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
                    <button type="button" onClick={() => void downloadIcs()} disabled={downloadingIcs} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs hover:bg-muted disabled:opacity-40">
                        {downloadingIcs ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download .ics
                    </button>
                    {downloadError ? <p className="text-destructive">{downloadError}</p> : null}
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

function GroupPostEditor({ group, post, vrcPlus, loading, error, cancel, save }: { group: VrchatGroup; post?: VrchatGroupPost; vrcPlus: boolean; loading: boolean; error: string; cancel: () => void; save: (input: GroupPostInput) => Promise<void> }) {
    const [title, setTitle] = useState(post?.title || "");
    const [message, setMessage] = useState(post?.text || "");
    const [sendNotification, setSendNotification] = useState(true);
    const [visibility, setVisibility] = useState<"group" | "public">(post?.visibility || "group");
    const [roleIds, setRoleIds] = useState(post?.roleIds || []);
    const [imageId, setImageId] = useState<string | null>(post?.imageId || null);
    const [imageUrl, setImageUrl] = useState(post?.imageUrl || "");
    const [galleryOpen, setGalleryOpen] = useState(false);
    const dialog = useRef<HTMLDivElement>(null);
    const titleInput = useRef<HTMLInputElement>(null);
    const galleryButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        titleInput.current?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                if (document.querySelector("[data-gallery-file-picker]")) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                cancel();
                return;
            }
            if (event.key !== "Tab" || !dialog.current) return;
            const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary"));
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
        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [cancel]);

    const valid = title.length > 0 && message.length > 0 && title.length <= 1_024 && message.length <= 10_000;
    const roleNames = new Map((group.roles || []).map((role) => [role.id, role.name]));
    const selectedRoleNames = roleIds.map((roleId) => roleNames.get(roleId) || roleId);
    const selectedRoleSummary = selectedRoleNames.length ? `${selectedRoleNames.slice(0, 3).join(", ")}${selectedRoleNames.length > 3 ? ` +${selectedRoleNames.length - 3}` : ""}` : "Select roles";
    return (
        <div data-group-post-overlay className="absolute inset-0 z-[90] flex items-center justify-center bg-black/65 p-3 sm:p-4">
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="group-post-editor-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[650px] overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h3 id="group-post-editor-title" className="font-semibold">
                    Create/Edit Post
                </h3>
                <form
                    className="mt-4 space-y-4 text-sm"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (valid) void save({ title, text: message, sendNotification, visibility, roleIds, imageId });
                    }}
                >
                    <label className="block">
                        <span className="text-xs font-medium">Title</span>
                        <input ref={titleInput} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={1_024} required className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-medium">Message</span>
                        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={10_000} required rows={4} className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    </label>
                    {!post ? (
                        <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={sendNotification} onChange={(event) => setSendNotification(event.target.checked)} className="size-4 accent-primary" />
                            Send Notification
                        </label>
                    ) : null}
                    <fieldset>
                        <legend className="text-xs font-medium">Post Visibility</legend>
                        <div className="mt-2 flex items-center gap-4 text-xs">
                            <label className="flex items-center gap-2">
                                <input type="radio" name="group-post-visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} className="size-4 accent-primary" /> Public
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="group-post-visibility" value="group" checked={visibility === "group"} onChange={() => setVisibility("group")} className="size-4 accent-primary" /> Group
                            </label>
                        </div>
                    </fieldset>
                    {visibility === "group" ? (
                        <div>
                            <span className="text-xs font-medium">Roles</span>
                            <details className="relative mt-1">
                                <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring [&::-webkit-details-marker]:hidden">{selectedRoleSummary}</summary>
                                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-xl">
                                    {(group.roles || []).map((role) => (
                                        <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted">
                                            <input type="checkbox" checked={roleIds.includes(role.id)} onChange={(event) => setRoleIds((current) => (event.target.checked ? [...current, role.id] : current.filter((roleId) => roleId !== role.id)))} className="size-4 accent-primary" />
                                            {role.name}
                                        </label>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ) : null}
                    {imageUrl && imageId ? (
                        <div>
                            <span className="block text-xs font-medium">Image</span>
                            <div className="mt-1 flex items-start gap-2">
                                <VrchatImage src={imageUrl} alt="" className="size-[60px] rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImageId(null);
                                        setImageUrl("");
                                    }}
                                    className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted"
                                >
                                    Clear selected image
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <span className="block text-xs font-medium">Image</span>
                            <button ref={galleryButton} type="button" onClick={() => setGalleryOpen(true)} className="mt-1 h-8 rounded-md border border-input px-3 text-xs hover:bg-muted">
                                Select image
                            </button>
                        </div>
                    )}
                    {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={cancel} disabled={loading} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading || !valid} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            {post ? "Edit Post" : "Create Post"}
                        </button>
                    </div>
                </form>
                {galleryOpen ? (
                    <GalleryFilePicker
                        vrcPlus={vrcPlus}
                        close={() => {
                            setGalleryOpen(false);
                            window.setTimeout(() => galleryButton.current?.focus(), 0);
                        }}
                        select={(file, url) => {
                            setImageId(file.id);
                            setImageUrl(url);
                            setGalleryOpen(false);
                            window.setTimeout(() => galleryButton.current?.focus(), 0);
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}

function GalleryFilePicker({ vrcPlus, close, select }: { vrcPlus: boolean; close: () => void; select: (file: VrchatFile, url: string) => void }) {
    const [files, setFiles] = useState<VrchatFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const dialog = useRef<HTMLDivElement>(null);
    const noneButton = useRef<HTMLButtonElement>(null);
    const uploadInput = useRef<HTMLInputElement>(null);

    const load = useCallback(async (refresh = false) => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/gallery/files${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
            const payload = (await response.json()) as { error?: string; files?: VrchatFile[] };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok) throw new Error(payload.error || "The personal gallery could not be loaded.");
            setFiles(payload.files || []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "The personal gallery could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        noneButton.current?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
                return;
            }
            if (event.key !== "Tab" || !dialog.current) return;
            const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [close, load]);

    async function upload(file: File) {
        setUploading(true);
        setError("");
        try {
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch("/api/gallery/files", { method: "POST", body: formData });
            const payload = (await response.json()) as { error?: string; file?: VrchatFile; refreshRequired?: boolean };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.file) throw new Error(payload.error || "The gallery image could not be uploaded.");
            setFiles((current) => [payload.file as VrchatFile, ...current.filter((item) => item.id !== payload.file?.id)]);
            if (payload.refreshRequired) void load(true);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "The gallery image could not be uploaded.");
        } finally {
            setUploading(false);
            if (uploadInput.current) uploadInput.current.value = "";
        }
    }

    return (
        <div data-gallery-file-picker className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-4">
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gallery-file-picker-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[900px] overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h4 id="gallery-file-picker-title" className="font-semibold">
                    Select Gallery Image
                </h4>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span>Gallery</span>
                    <span className="text-muted-foreground">{files.length}/64</span>
                    <button ref={noneButton} type="button" onClick={close} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted">
                        <X className="size-3.5" /> None
                    </button>
                    <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
                    </button>
                    <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
                    <button type="button" onClick={() => uploadInput.current?.click()} disabled={!vrcPlus || uploading} title={vrcPlus ? undefined : "VRChat+ is required"} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
                    </button>
                </div>
                {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,200px)] gap-5">
                    {files.map((file) => {
                        const url = latestVrchatFileUrl(file);
                        return url ? (
                            <button key={file.id} type="button" onClick={() => select(file, url)} className="size-[200px] overflow-hidden rounded-[20px] bg-muted focus:ring-2 focus:ring-ring" aria-label={`Select gallery image ${file.name || file.id}`}>
                                <VrchatImage src={url} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                            </button>
                        ) : null;
                    })}
                </div>
                {!loading && !files.some((file) => latestVrchatFileUrl(file)) ? <EmptyState>No gallery images.</EmptyState> : null}
            </div>
        </div>
    );
}

function GroupPostDeleteConfirmation({ post, loading, error, cancel, confirm }: { post: VrchatGroupPost; loading: boolean; error: string; cancel: () => void; confirm: () => void }) {
    const cancelButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        cancelButton.current?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            cancel();
        }
        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [cancel]);
    return (
        <div data-group-post-overlay className="absolute inset-0 z-[90] flex items-center justify-center bg-black/65 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="group-post-delete-title" className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h3 id="group-post-delete-title" className="font-semibold">
                    Delete post?
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">Are you sure you want to delete “{post.title || "Untitled post"}”?</p>
                {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                    <button ref={cancelButton} type="button" onClick={cancel} disabled={loading} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                        Cancel
                    </button>
                    <button type="button" onClick={confirm} disabled={loading} className="inline-flex h-9 items-center gap-1 rounded-md bg-destructive px-4 text-xs text-white disabled:opacity-40">
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

function GroupPosts({
    posts,
    group,
    search,
    setSearch,
    refresh,
    openUser,
    editPost,
    deletePost,
}: {
    posts: VrchatGroupPost[];
    group: VrchatGroup;
    search: string;
    setSearch: (value: string) => void;
    refresh: () => void;
    openUser: (userId: string) => void;
    editPost: (post: VrchatGroupPost, trigger: HTMLButtonElement) => void;
    deletePost: (post: VrchatGroupPost, trigger: HTMLButtonElement) => void;
}) {
    const query = search.trim().toLocaleLowerCase();
    const visible = posts.filter((post) => !query || `${post.title} ${post.text}`.toLocaleLowerCase().includes(query));
    const roleNames = new Map((group.roles || []).map((role) => [role.id, role.name]));
    const canManage = canManageGroupPosts(group);
    return (
        <div>
            <TabToolbar count={posts.length} value={search} setValue={setSearch} refresh={refresh} placeholder="Search posts" />
            <div className="space-y-1">
                {visible.map((post) => (
                    <article key={post.id} className="rounded-lg p-2 text-[13px] hover:bg-background">
                        <p className="font-medium">{post.title || "Untitled post"}</p>
                        <div className="mt-1 flex items-start gap-2">
                            {post.imageUrl ? <VrchatImage src={post.imageUrl} alt="" className="size-[60px] shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}
                            <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs">{post.text || "—"}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px] text-muted-foreground">
                            {post.roleIds.length ? (
                                <span className="inline-flex items-center gap-1" title={`Visibility: ${post.roleIds.map((roleId) => roleNames.get(roleId) || roleId).join(", ")}`}>
                                    <Eye className="size-3.5" />
                                    <span className="sr-only">Role-restricted post</span>
                                </span>
                            ) : null}
                            {post.authorId ? (
                                <button type="button" onClick={() => openUser(post.authorId || "")} className="hover:text-foreground">
                                    {post.authorId}
                                </button>
                            ) : null}
                            <span>{dateTime(post.updatedAt || post.createdAt)}</span>
                            {canManage ? (
                                <>
                                    <button type="button" onClick={(event) => editPost(post, event.currentTarget)} className="inline-flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground" aria-label="Edit post">
                                        <Pencil className="size-3.5" />
                                    </button>
                                    <button type="button" onClick={(event) => deletePost(post, event.currentTarget)} className="inline-flex size-6 items-center justify-center rounded hover:bg-muted hover:text-destructive" aria-label="Delete post">
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </>
                            ) : null}
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

function GroupPhotos({ galleries, images, truncatedGalleryIds, loading, refresh }: { galleries: VrchatGroupGallery[]; images: VrchatGroupGalleryImage[]; truncatedGalleryIds: string[]; loading: boolean; refresh: () => void }) {
    const [selectedGalleryId, setSelectedGalleryId] = useState("");
    const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
    const previewTrigger = useRef<HTMLButtonElement | null>(null);
    const previewCloseButton = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!galleries.some((gallery) => gallery.id === selectedGalleryId)) setSelectedGalleryId(galleries[0]?.id || "");
    }, [galleries, selectedGalleryId]);

    useEffect(() => {
        if (!preview) return;
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Tab") {
                event.preventDefault();
                previewCloseButton.current?.focus();
                return;
            }
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setPreview(null);
            window.setTimeout(() => previewTrigger.current?.focus(), 0);
        }
        window.addEventListener("keydown", closeOnEscape, true);
        previewCloseButton.current?.focus();
        return () => window.removeEventListener("keydown", closeOnEscape, true);
    }, [preview]);

    const selectedGallery = galleries.find((gallery) => gallery.id === selectedGalleryId);
    const imageCounts = new Map<string, number>();
    for (const image of images) imageCounts.set(image.galleryId, (imageCounts.get(image.galleryId) || 0) + 1);
    const selectedImages = selectedGallery ? images.filter((image) => image.galleryId === selectedGallery.id) : [];

    function closePreview() {
        setPreview(null);
        window.setTimeout(() => previewTrigger.current?.focus(), 0);
    }

    return (
        <div>
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Refresh group photos">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
            <div className="mt-2.5 flex overflow-x-auto border-b border-border" role="tablist" aria-label="Group galleries">
                {galleries.map((gallery) => {
                    const selected = gallery.id === selectedGalleryId;
                    const count = imageCounts.get(gallery.id) || 0;
                    const truncated = truncatedGalleryIds.includes(gallery.id);
                    const restriction = !gallery.membersOnly ? "Public gallery" : gallery.roleIdsToView == null ? "Members-only gallery" : "Role-restricted gallery";
                    const dotColor = !gallery.membersOnly ? "bg-status-joinme" : gallery.roleIdsToView == null ? "bg-status-online" : "bg-status-busy";
                    return (
                        <button
                            key={gallery.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-controls={`group-gallery-${gallery.id}`}
                            onClick={() => setSelectedGalleryId(gallery.id)}
                            className={`flex h-10 shrink-0 items-center border-b-2 px-3 text-left ${selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                            <span className="text-base font-bold">{gallery.name}</span>
                            <span className={`ml-1.5 size-2.5 rounded-full ${dotColor}`} aria-hidden="true" title={restriction} />
                            <span className="sr-only">{restriction}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">
                                {count}
                                {truncated ? "+" : ""}
                            </span>
                        </button>
                    );
                })}
            </div>
            {selectedGallery ? (
                <section id={`group-gallery-${selectedGallery.id}`} role="tabpanel" className="pt-2">
                    <p className="px-2 text-sm text-muted-foreground">{selectedGallery.description}</p>
                    <div className="mt-2 grid max-h-[600px] grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 overflow-y-auto">
                        {selectedImages.map((image) => (
                            <button
                                key={image.id}
                                type="button"
                                onClick={(event) => {
                                    previewTrigger.current = event.currentTarget;
                                    setPreview({ url: image.imageUrl, name: selectedGallery.name });
                                }}
                                className="overflow-hidden rounded-md border border-border bg-card p-0 transition-shadow hover:shadow-md"
                                aria-label={`Open photo from ${selectedGallery.name}`}
                            >
                                <VrchatImage
                                    src={image.imageUrl}
                                    alt=""
                                    className="max-h-full max-w-full"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                        event.currentTarget.style.display = "none";
                                        const fallback = event.currentTarget.nextElementSibling;
                                        if (fallback instanceof HTMLElement) fallback.style.display = "flex";
                                    }}
                                    fallback={<PhotoFallback />}
                                />
                                <PhotoFallback hidden />
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}
            {preview ? (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={`Photo from ${preview.name}`} data-group-photo-preview="true">
                    <button type="button" tabIndex={-1} className="absolute inset-0" onClick={closePreview} aria-label="Close photo preview" />
                    <VrchatImage src={preview.url} alt={`Photo from ${preview.name}`} className="relative max-h-full max-w-full object-contain" referrerPolicy="no-referrer" fallback={<PhotoFallback />} />
                    <button ref={previewCloseButton} type="button" onClick={closePreview} className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow" aria-label="Close photo preview">
                        <X className="size-4" />
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function PhotoFallback({ hidden = false }: { hidden?: boolean }) {
    return (
        <div className={`h-[200px] w-full items-center justify-center bg-muted ${hidden ? "hidden" : "flex"}`}>
            <ImageIcon className="size-8 text-muted-foreground" />
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
