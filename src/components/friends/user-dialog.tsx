"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CalendarDays, Clipboard, ExternalLink, Image as ImageIcon, Link as LinkIcon, Loader2, LogIn, MapPin, RefreshCw, Shield, ShieldCheck, Trash2, UserRound, X } from "lucide-react";

import { type FriendActivity, trustLevelFromTags } from "@/lib/activity-log";
import { friendImage, locationLabel, statusColor } from "@/lib/friends";
import type { VrchatGroup, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type UserTab = "Info" | "Mutual" | "Groups" | "Worlds" | "Activity" | "JSON";
const tabs: UserTab[] = ["Info", "Mutual", "Groups", "Worlds", "Activity", "JSON"];
const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, key: `hour-${hour}` }));

function formatDate(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeExternalUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
        return "";
    }
}

function userLanguages(user: VrchatUser) {
    return (user.tags || []).filter((tag) => tag.startsWith("language_")).map((tag) => tag.slice("language_".length).toUpperCase());
}

export function UserDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
    const { friends, openUser, removeFriend } = useFriends();
    const [user, setUser] = useState<VrchatUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<UserTab>("Info");
    const [confirming, setConfirming] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [mutuals, setMutuals] = useState<VrchatUser[]>([]);
    const [groups, setGroups] = useState<VrchatGroup[]>([]);
    const [worlds, setWorlds] = useState<VrchatWorld[]>([]);
    const [activity, setActivity] = useState<FriendActivity[]>([]);
    const [tabLoading, setTabLoading] = useState(false);
    const [tabLoaded, setTabLoaded] = useState<Set<UserTab>>(new Set(["Info", "JSON"]));
    const [tabSearch, setTabSearch] = useState("");
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const friendsRef = useRef(friends);
    friendsRef.current = friends;

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        setActiveTab("Info");
        setTabLoaded(new Set(["Info", "JSON"]));
        setMutuals([]);
        setGroups([]);
        setWorlds([]);
        setActivity([]);
        fetch(`/api/users/${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const payload = (await response.json()) as { error?: string; user?: VrchatUser };
                if (!response.ok || !payload.user) throw new Error(payload.error || "The user could not be loaded.");
                setUser(payload.user);
                const settingsResponse = await fetch("/api/settings", { cache: "no-store", signal: controller.signal });
                const settings = (await settingsResponse.json()) as { userDialogLastTab?: UserTab };
                const requestedTab = settings.userDialogLastTab;
                const friend = payload.user.isFriend === true || friendsRef.current.some((item) => item.id === userId);
                if (requestedTab && tabs.includes(requestedTab) && (requestedTab !== "Mutual" || friend)) setActiveTab(requestedTab);
            })
            .catch((requestError) => {
                if (requestError instanceof DOMException && requestError.name === "AbortError") return;
                setError(requestError instanceof Error ? requestError.message : "The user could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [userId]);

    useEffect(() => {
        closeButtonRef.current?.focus();
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    const loadTab = useCallback(
        async (tab: UserTab, force = false) => {
            if ((!force && tabLoaded.has(tab)) || tab === "Info" || tab === "JSON") return;
            setTabLoading(true);
            setError("");
            try {
                if (tab === "Mutual") {
                    const results: VrchatUser[] = [];
                    for (let offset = 0; offset <= 5_000; offset += 100) {
                        const response = await fetch(`/api/users/${encodeURIComponent(userId)}/mutuals?offset=${offset}`, { cache: "no-store" });
                        const payload = (await response.json()) as { error?: string; mutuals?: VrchatUser[] };
                        if (!response.ok) throw new Error(payload.error || "Mutual friends could not be loaded.");
                        results.push(...(payload.mutuals || []));
                        if ((payload.mutuals || []).length < 100) break;
                    }
                    setMutuals(Array.from(new Map(results.map((item) => [item.id, item])).values()).toSorted((left, right) => left.displayName.localeCompare(right.displayName)));
                } else if (tab === "Groups") {
                    const response = await fetch(`/api/users/${encodeURIComponent(userId)}/groups`, { cache: "no-store" });
                    const payload = (await response.json()) as { error?: string; groups?: VrchatGroup[] };
                    if (!response.ok) throw new Error(payload.error || "Groups could not be loaded.");
                    setGroups((payload.groups || []).toSorted((left, right) => left.name.localeCompare(right.name)));
                } else if (tab === "Worlds") {
                    const results: VrchatWorld[] = [];
                    for (let offset = 0; offset <= 5_000; offset += 50) {
                        const response = await fetch(`/api/users/${encodeURIComponent(userId)}/worlds?offset=${offset}`, { cache: "no-store" });
                        const payload = (await response.json()) as { error?: string; worlds?: VrchatWorld[] };
                        if (!response.ok) throw new Error(payload.error || "Worlds could not be loaded.");
                        results.push(...(payload.worlds || []));
                        if ((payload.worlds || []).length < 50) break;
                    }
                    setWorlds(Array.from(new Map(results.map((item) => [item.id, item])).values()));
                } else if (tab === "Activity") {
                    const response = await fetch("/api/activity?limit=2000", { cache: "no-store" });
                    const payload = (await response.json()) as { error?: string; entries?: FriendActivity[] };
                    if (!response.ok) throw new Error(payload.error || "Activity could not be loaded.");
                    setActivity((payload.entries || []).filter((entry) => entry.userId === userId));
                }
                setTabLoaded((current) => new Set(current).add(tab));
            } catch (requestError) {
                setError(requestError instanceof Error ? requestError.message : `${tab} could not be loaded.`);
            } finally {
                setTabLoading(false);
            }
        },
        [tabLoaded, userId],
    );

    useEffect(() => {
        void loadTab(activeTab);
    }, [activeTab, loadTab]);

    async function copyUserId() {
        await navigator.clipboard.writeText(userId);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    }

    async function unfriend() {
        if (!user) return;
        setRemoving(true);
        setError("");
        try {
            const response = await fetch(`/api/friends/${encodeURIComponent(user.id)}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The friend could not be removed.");
            removeFriend(user.id);
            onClose();
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "The friend could not be removed.");
            setConfirming(false);
        } finally {
            setRemoving(false);
        }
    }

    const isFriend = user?.isFriend === true || friends.some((friend) => friend.id === userId);
    const visibleTabs = tabs.filter((tab) => tab !== "Mutual" || isFriend);
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close user details" />
            <section role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background p-2 shadow-2xl sm:h-[min(88dvh,780px)] sm:max-w-6xl sm:rounded-xl sm:border">
                <h2 id="user-dialog-title" className="sr-only">
                    {user?.displayName || "User details"}
                </h2>
                <button ref={closeButtonRef} type="button" onClick={onClose} className="absolute top-2 right-2 z-40 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow hover:text-foreground" aria-label="Close">
                    <X className="size-4" />
                </button>
                {loading ? (
                    <div className="flex min-h-96 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        Loading user…
                    </div>
                ) : null}
                {!loading && error && !user ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div> : null}
                {!loading && user ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
                        <aside className="w-full shrink-0 overflow-y-auto md:w-[308px]">
                            <UserSummary user={user} isFriend={isFriend} copied={copied} confirming={confirming} removing={removing} copyUserId={copyUserId} setConfirming={setConfirming} unfriend={unfriend} />
                        </aside>
                        <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col md:min-h-0">
                            <div className="flex shrink-0 overflow-x-auto rounded-t-xl bg-card px-1" role="tablist" aria-label="User details">
                                {visibleTabs.map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTab === tab}
                                        onClick={() => {
                                            setActiveTab(tab);
                                            setTabSearch("");
                                            setError("");
                                            void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userDialogLastTab: tab }) });
                                        }}
                                        className={`h-10 shrink-0 border-b-2 px-3 text-xs ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto rounded-b-xl bg-card p-2">
                                {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                                {tabLoading ? (
                                    <div className="flex min-h-64 items-center justify-center">
                                        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={`Loading ${activeTab}`} />
                                    </div>
                                ) : null}
                                {!tabLoading && activeTab === "Info" ? <InfoTab user={user} /> : null}
                                {!tabLoading && activeTab === "Mutual" ? <MutualTab users={mutuals} search={tabSearch} setSearch={setTabSearch} refresh={() => void loadTab("Mutual", true)} openUser={openUser} /> : null}
                                {!tabLoading && activeTab === "Groups" ? <GroupsTab groups={groups} search={tabSearch} setSearch={setTabSearch} refresh={() => void loadTab("Groups", true)} /> : null}
                                {!tabLoading && activeTab === "Worlds" ? <WorldsTab worlds={worlds} search={tabSearch} setSearch={setTabSearch} refresh={() => void loadTab("Worlds", true)} /> : null}
                                {!tabLoading && activeTab === "Activity" ? <ActivityTab entries={activity} refresh={() => void loadTab("Activity", true)} /> : null}
                                {!tabLoading && activeTab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(user, null, 2)}</pre> : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

type SummaryProps = { user: VrchatUser; isFriend: boolean; copied: boolean; confirming: boolean; removing: boolean; copyUserId: () => Promise<void>; setConfirming: (value: boolean) => void; unfriend: () => Promise<void> };

function UserSummary({ user, isFriend, copied, confirming, removing, copyUserId, setConfirming, unfriend }: SummaryProps) {
    const image = friendImage(user);
    const bannerColor = user.bannerColor && /^[0-9a-f]{6}$/i.test(user.bannerColor) ? `#${user.bannerColor}` : undefined;
    return (
        <div className="overflow-hidden rounded-xl bg-card">
            <div className="relative aspect-[17/6]" style={{ backgroundColor: bannerColor || "var(--muted)" }}>
                {user.bannerType !== "color" && user.bannerUrl ? <img src={user.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" /> : null}
                <div className="absolute bottom-0 left-3 size-24 translate-y-1/2 overflow-hidden rounded-lg bg-muted shadow-xl">
                    {image ? (
                        <img src={image} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                        <span className="flex size-full items-center justify-center">
                            <UserRound className="size-9 text-muted-foreground" />
                        </span>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-2 px-3 pt-14 pb-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-1">
                        <h3 className="break-words font-bold">{user.displayName}</h3>
                        {user.pronouns ? <span className="font-mono text-[10px] text-muted-foreground">{user.pronouns}</span> : null}
                    </div>
                    {user.username ? <p className="font-mono text-[10px] text-muted-foreground">{user.username}</p> : null}
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor(user.status) }} />
                        {user.statusDescription || user.state || user.status || "Offline"}
                    </p>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5">
                        <Shield className="size-3" />
                        {trustLevelFromTags(user.tags)}
                    </span>
                    {user.platform || user.last_platform ? <span className="inline-flex h-5 items-center rounded border border-border px-1.5 uppercase">{user.platform || user.last_platform}</span> : null}
                    {userLanguages(user).map((language) => (
                        <span key={language} className="inline-flex h-5 items-center rounded border border-border px-1.5">
                            {language}
                        </span>
                    ))}
                </div>
                {user.badges?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                        {user.badges.map((badge) =>
                            badge.badgeImageUrl ? (
                                <img key={`${badge.badgeName}:${badge.badgeImageUrl}`} src={badge.badgeImageUrl} alt={badge.badgeName || "Badge"} title={`${badge.badgeName || "Badge"}${badge.badgeDescription ? ` — ${badge.badgeDescription}` : ""}`} className="size-8 rounded object-cover" loading="lazy" />
                            ) : null,
                        )}
                    </div>
                ) : null}
                {user.representedGroup?.name ? (
                    <div className="flex items-center gap-2 border-t border-border pt-2">
                        {user.representedGroup.iconUrl ? <img src={user.representedGroup.iconUrl} alt="" className="size-8 rounded object-cover" /> : <ShieldCheck className="size-5 text-primary" />}
                        <span className="min-w-0 text-xs">
                            <span className="block truncate">{user.representedGroup.name}</span>
                            <span className="text-[10px] text-muted-foreground">{user.representedGroup.shortCode}</span>
                        </span>
                    </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                    <button type="button" onClick={() => void copyUserId()} className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-secondary text-xs">
                        <Clipboard className="size-3.5" />
                        {copied ? "Copied" : "Copy ID"}
                    </button>
                    <a href={`https://vrchat.com/home/user/${encodeURIComponent(user.id)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-secondary text-xs">
                        <ExternalLink className="size-3.5" />
                        VRChat
                    </a>
                </div>
                {isFriend ? (
                    confirming ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                            <p>Remove {user.displayName}?</p>
                            <div className="mt-2 flex gap-2">
                                <button type="button" onClick={() => setConfirming(false)} disabled={removing} className="h-8 flex-1 rounded bg-secondary">
                                    Cancel
                                </button>
                                <button type="button" onClick={() => void unfriend()} disabled={removing} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded bg-destructive text-white">
                                    {removing ? <Loader2 className="size-3.5 animate-spin" /> : null}Unfriend
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={() => setConfirming(true)} className="inline-flex h-8 items-center justify-center gap-1 text-xs text-destructive hover:bg-destructive/10">
                            <Trash2 className="size-3.5" />
                            Unfriend
                        </button>
                    )
                ) : null}
            </div>
        </div>
    );
}

function InfoTab({ user }: { user: VrchatUser }) {
    return (
        <div className="space-y-2">
            <section className="rounded-xl bg-background p-3">
                <SectionTitle>Current instance</SectionTitle>
                <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="flex items-start gap-1.5 text-sm">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span className="break-all">{locationLabel(user)}</span>
                        </p>
                        {user.location && !["private", "offline", "traveling"].includes(user.location) ? <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{user.location}</p> : null}
                    </div>
                    {user.world?.thumbnailImageUrl ? <img src={user.world.thumbnailImageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" loading="lazy" /> : null}
                </div>
            </section>
            {user.note ? (
                <section className="rounded-xl bg-background p-3">
                    <SectionTitle>Note</SectionTitle>
                    <p className="whitespace-pre-wrap text-sm">{user.note}</p>
                </section>
            ) : null}
            <section className="rounded-xl bg-background p-3">
                <SectionTitle>Bio</SectionTitle>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{user.bio || "No bio provided."}</p>
                {user.bioLinks?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {user.bioLinks.map((link) => {
                            const href = safeExternalUrl(link);
                            return href ? (
                                <a key={link} href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-primary hover:underline">
                                    <LinkIcon className="size-3 shrink-0" />
                                    <span className="truncate">{link}</span>
                                </a>
                            ) : null;
                        })}
                    </div>
                ) : null}
            </section>
            <section className="grid gap-2 sm:grid-cols-2">
                <InfoCard icon={<CalendarDays className="size-4" />} label="Joined VRChat" value={formatDate(user.date_joined)} />
                <InfoCard icon={<LogIn className="size-4" />} label="Last login" value={formatDate(user.last_login || user.last_activity)} />
            </section>
        </div>
    );
}

function TabToolbar({ count, search, setSearch, refresh, placeholder }: { count: number; search: string; setSearch: (value: string) => void; refresh: () => void; placeholder: string }) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={refresh} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Refresh">
                <RefreshCw className="size-4" />
            </button>
            <span className="mr-auto text-xs">{count} total</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-40 rounded border border-input bg-background px-2 text-xs" placeholder={placeholder} />
        </div>
    );
}

function MutualTab({ users, search, setSearch, refresh, openUser }: { users: VrchatUser[]; search: string; setSearch: (value: string) => void; refresh: () => void; openUser: (id: string) => void }) {
    const filtered = users.filter((user) => user.displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return (
        <div>
            <TabToolbar count={users.length} search={search} setSearch={setSearch} refresh={refresh} placeholder="Search friends" />
            <ul className="flex flex-wrap items-start">
                {filtered.map((user) => (
                    <li key={user.id}>
                        <button type="button" onClick={() => openUser(user.id)} className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                            <FriendAvatar friend={user} size="sm" />
                            <span className="min-w-0 truncate font-medium">{user.displayName}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {!filtered.length ? <EmptyState /> : null}
        </div>
    );
}

function GroupsTab({ groups, search, setSearch, refresh }: { groups: VrchatGroup[]; search: string; setSearch: (value: string) => void; refresh: () => void }) {
    const filtered = groups.filter((group) => group.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return (
        <div>
            <TabToolbar count={groups.length} search={search} setSearch={setSearch} refresh={refresh} placeholder="Search groups" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((group) => (
                    <a key={group.id} href={`https://vrchat.com/home/group/${encodeURIComponent(group.id)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-background p-2 hover:bg-muted">
                        {group.iconUrl ? <img src={group.iconUrl} alt="" className="size-9 rounded object-cover" /> : <ShieldCheck className="size-5 text-primary" />}
                        <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{group.name}</span>
                            <span className="text-[10px] text-muted-foreground">{group.shortCode || group.memberCount || ""}</span>
                        </span>
                    </a>
                ))}
            </div>
            {!filtered.length ? <EmptyState /> : null}
        </div>
    );
}

function WorldsTab({ worlds, search, setSearch, refresh }: { worlds: VrchatWorld[]; search: string; setSearch: (value: string) => void; refresh: () => void }) {
    const filtered = worlds.filter((world) => world.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return (
        <div>
            <TabToolbar count={worlds.length} search={search} setSearch={setSearch} refresh={refresh} placeholder="Search worlds" />
            <div className="flex flex-wrap items-start">
                {filtered.map((world) => (
                    <a key={world.id} href={`https://vrchat.com/home/world/${encodeURIComponent(world.id)}`} target="_blank" rel="noreferrer" className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-[13px] hover:bg-muted">
                        {world.thumbnailImageUrl ? (
                            <img src={world.thumbnailImageUrl} alt="" className="size-9 rounded object-cover" />
                        ) : (
                            <span className="flex size-9 items-center justify-center rounded bg-muted">
                                <ImageIcon className="size-4" />
                            </span>
                        )}
                        <span className="min-w-0">
                            <span className="block truncate font-medium">{world.name}</span>
                            {world.occupants ? <span className="block text-[10px] text-muted-foreground">({world.occupants})</span> : null}
                        </span>
                    </a>
                ))}
            </div>
            {!filtered.length ? <EmptyState /> : null}
        </div>
    );
}

function ActivityTab({ entries, refresh }: { entries: FriendActivity[]; refresh: () => void }) {
    const counts = useMemo(() => {
        const values = Array.from({ length: 7 * 24 }, () => 0);
        for (const entry of entries) {
            const date = new Date(entry.createdAt);
            if (!Number.isNaN(date.getTime())) values[date.getDay() * 24 + date.getHours()] += 1;
        }
        return values;
    }, [entries]);
    const max = Math.max(1, ...counts);
    const dayTotals = Array.from({ length: 7 }, (_, day) => counts.slice(day * 24, (day + 1) * 24).reduce((sum, value) => sum + value, 0));
    const hourTotals = Array.from({ length: 24 }, (_, hour) => counts.filter((_, index) => index % 24 === hour).reduce((sum, value) => sum + value, 0));
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
        <div>
            <div className="mb-3 flex items-center gap-2">
                <button type="button" onClick={refresh} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted">
                    <RefreshCw className="size-4" />
                </button>
                <span className="text-xs">{entries.length} remotely observed events</span>
            </div>
            {entries.length ? (
                <>
                    <div className="mb-3 flex flex-wrap gap-4 text-xs">
                        <span>
                            <span className="text-muted-foreground">Most active day</span> <strong>{days[dayTotals.indexOf(Math.max(...dayTotals))]}</strong>
                        </span>
                        <span>
                            <span className="text-muted-foreground">Most active time</span> <strong>{String(hourTotals.indexOf(Math.max(...hourTotals))).padStart(2, "0")}:00</strong>
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <div className="grid min-w-[580px] grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-1 text-[9px]">
                            {days.map((day, dayIndex) => (
                                <ActivityDayRow key={day} day={day} dayIndex={dayIndex} counts={counts} max={max} />
                            ))}
                        </div>
                        <div className="ml-9 mt-1 grid min-w-[548px] grid-cols-24 text-[8px] text-muted-foreground">
                            {hours.map(({ hour, key }) => (
                                <span key={key}>{hour % 3 === 0 ? hour : ""}</span>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <EmptyState />
            )}
        </div>
    );
}

function ActivityDayRow({ day, dayIndex, counts, max }: { day: string; dayIndex: number; counts: number[]; max: number }) {
    return (
        <>
            <span className="self-center text-muted-foreground">{day}</span>
            {hours.map(({ hour, key }) => {
                const count = counts[dayIndex * 24 + hour] || 0;
                return <span key={`${day}-${key}`} className="aspect-square rounded-sm border border-border" style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${(count / max) * 90}%, transparent)` }} title={`${day} ${String(hour).padStart(2, "0")}:00 — ${count} events`} />;
            })}
        </>
    );
}

function EmptyState() {
    return <div className="flex min-h-40 items-center justify-center text-xs text-muted-foreground">No data</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="mb-2 border-b border-border pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-xl bg-background p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                {icon}
                {label}
            </p>
            <p className="mt-1 text-xs">{value}</p>
        </div>
    );
}
