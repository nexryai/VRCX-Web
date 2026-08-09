"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Bell, ChevronDown, RefreshCw, Search, Settings, User } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { VrchatImage } from "@/components/vrchat-image";
import { locationLabel } from "@/lib/friends";
import type { VrchatFavorite, VrchatGroup, VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type SectionKey = "active" | "favorite" | "me" | "offline" | "online";
type SidebarTab = "friends" | "groups";

export function FriendsSidebar() {
    const currentUser = useCurrentUser();
    const { friends, allFriends, loading, refresh, openUser, openGroup } = useFriends();
    const [search, setSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [groupByInstance, setGroupByInstance] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
    const [tab, setTab] = useState<SidebarTab>("friends");
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [groups, setGroups] = useState<VrchatGroup[]>([]);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function loadSidebarData() {
            const [settingsResponse, favoritesResponse, groupsResponse] = await Promise.all([
                fetch("/api/settings", { cache: "no-store", signal: controller.signal }),
                fetch("/api/favorites?section=records&offset=0", { cache: "no-store", signal: controller.signal }),
                fetch("/api/groups", { cache: "no-store", signal: controller.signal }),
            ]);
            const settings = (await settingsResponse.json()) as { sidebarGroupByInstance?: boolean; sidebarCollapsedSections?: SectionKey[]; sidebarTab?: SidebarTab };
            const favorites = (await favoritesResponse.json()) as { favorites?: VrchatFavorite[] };
            const groupPayload = (await groupsResponse.json()) as { groups?: VrchatGroup[] };
            setGroupByInstance(settings.sidebarGroupByInstance === true);
            setCollapsed(new Set(settings.sidebarCollapsedSections ?? []));
            setTab(settings.sidebarTab ?? "friends");
            setFavoriteIds(new Set((favorites.favorites ?? []).filter((favorite) => favorite.type === "friend").map((favorite) => favorite.favoriteId)));
            setGroups(groupPayload.groups ?? []);
        }
        void loadSidebarData().catch(() => undefined);
        return () => controller.abort();
    }, []);

    useEffect(() => {
        function handleShortcut(event: KeyboardEvent) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
                event.preventDefault();
                setSearchOpen(true);
                requestAnimationFrame(() => searchRef.current?.focus());
            }
        }
        window.addEventListener("keydown", handleShortcut);
        return () => window.removeEventListener("keydown", handleShortcut);
    }, []);

    const sections = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const matches = (friend: VrchatUser) => !query || `${friend.displayName} ${friend.statusDescription || ""} ${locationLabel(friend)}`.toLocaleLowerCase().includes(query);
        const onlineIds = new Set(friends.map((friend) => friend.id));
        const favorite = friends.filter((friend) => favoriteIds.has(friend.id) && matches(friend));
        const online = friends.filter((friend) => !favoriteIds.has(friend.id) && matches(friend));
        const active = allFriends.filter((friend) => friend.state === "active" && matches(friend));
        const offline = allFriends.filter((friend) => !onlineIds.has(friend.id) && friend.state !== "active" && matches(friend));
        return { favorite, online, active, offline };
    }, [allFriends, favoriteIds, friends, search]);

    function save(update: object) {
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
    }

    function toggleSection(section: SectionKey) {
        setCollapsed((current) => {
            const next = new Set(current);
            next.has(section) ? next.delete(section) : next.add(section);
            save({ sidebarCollapsedSections: [...next] });
            return next;
        });
    }

    function selectTab(value: SidebarTab) {
        setTab(value);
        save({ sidebarTab: value });
    }

    return (
        <aside className="hidden h-full min-h-0 w-[19rem] shrink-0 flex-col bg-sidebar p-[8px_6px_6px_8px] xl:flex" aria-label="Friends and groups sidebar">
            <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1 py-2 pr-1">
                    {searchOpen ? (
                        <label className="relative block">
                            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50" />
                            <input
                                ref={searchRef}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onBlur={() => {
                                    if (!search) setSearchOpen(false);
                                }}
                                className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring"
                                placeholder="Search friends"
                            />
                        </label>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchOpen(true);
                                requestAnimationFrame(() => searchRef.current?.focus());
                            }}
                            className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-md border border-input bg-transparent px-3 text-sm shadow-xs hover:border-ring"
                        >
                            <Search className="size-4 shrink-0 opacity-50" />
                            <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">Quick Search</span>
                            <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">Ctrl</kbd>
                            <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">K</kbd>
                        </button>
                    )}
                </div>
                <button type="button" onClick={() => void refresh()} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent disabled:opacity-50" disabled={loading} aria-label="Refresh friends">
                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <Link href="/notification" className="relative inline-flex size-8 items-center justify-center rounded-full hover:bg-accent" aria-label="Notification Center">
                    <Bell className="size-4" />
                </Link>
                <div className="relative">
                    <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent" aria-label="Sidebar settings">
                        <Settings className="size-4" />
                    </button>
                    {settingsOpen ? (
                        <div className="absolute top-10 right-0 z-30 w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
                            <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Display</p>
                            <label className="flex items-center justify-between gap-3">
                                <span>Group by instance</span>
                                <input
                                    type="checkbox"
                                    checked={groupByInstance}
                                    onChange={(event) => {
                                        setGroupByInstance(event.target.checked);
                                        save({ sidebarGroupByInstance: event.target.checked });
                                    }}
                                    className="size-4 accent-primary"
                                />
                            </label>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="mb-1 flex shrink-0 rounded-md bg-muted p-1" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "friends"} onClick={() => selectTab("friends")} className={`h-7 flex-1 rounded-sm text-xs font-medium ${tab === "friends" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    Friends <span className="ml-2">{allFriends.length}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === "groups"} onClick={() => selectTab("groups")} className={`h-7 flex-1 rounded-sm text-xs font-medium ${tab === "groups" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    Groups <span className="ml-2">{groups.length}</span>
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                {tab === "groups" ? (
                    <GroupList groups={groups} search={search} openGroup={openGroup} />
                ) : (
                    <>
                        <SidebarSection label="Me" section="me" count={1} collapsed={collapsed.has("me")} toggle={toggleSection}>
                            <SidebarUser user={currentUser} openUser={openUser} />
                        </SidebarSection>
                        <SidebarSection label="Favorites" section="favorite" count={sections.favorite.length} collapsed={collapsed.has("favorite")} toggle={toggleSection}>
                            {renderFriends(sections.favorite, openUser, groupByInstance)}
                        </SidebarSection>
                        <SidebarSection label="Online" section="online" count={sections.online.length} collapsed={collapsed.has("online")} toggle={toggleSection}>
                            {renderFriends(sections.online, openUser, groupByInstance)}
                        </SidebarSection>
                        <SidebarSection label="Active" section="active" count={sections.active.length} collapsed={collapsed.has("active")} toggle={toggleSection}>
                            {renderFriends(sections.active, openUser, false)}
                        </SidebarSection>
                        <SidebarSection label="Offline" section="offline" count={sections.offline.length} collapsed={collapsed.has("offline")} toggle={toggleSection}>
                            {renderFriends(sections.offline, openUser, false)}
                        </SidebarSection>
                    </>
                )}
            </div>
        </aside>
    );
}

function SidebarSection({ label, section, count, collapsed, toggle, children }: { label: string; section: SectionKey; count: number; collapsed: boolean; toggle: (section: SectionKey) => void; children: React.ReactNode }) {
    return (
        <section>
            <button type="button" onClick={() => toggle(section)} className="flex w-full items-center pt-4 pb-1.5 text-xs">
                <ChevronDown className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                <span className="ml-1.5">
                    {label} ― {count}
                </span>
            </button>
            {collapsed ? null : children}
        </section>
    );
}

function SidebarUser({ user, openUser }: { user: VrchatUser; openUser: (userId: string) => void }) {
    return (
        <button type="button" onClick={() => openUser(user.id)} className="flex w-full items-center p-1.5 text-left text-[13px] hover:rounded-lg hover:bg-muted/50">
            <FriendAvatar friend={user} />
            <span className="ml-2.5 min-w-0 flex-1">
                <span className="block truncate font-medium leading-[18px]">{user.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{locationLabel(user) || user.statusDescription}</span>
            </span>
        </button>
    );
}

function renderFriends(friends: VrchatUser[], openUser: (userId: string) => void, groupByInstance: boolean) {
    if (!groupByInstance) return friends.map((friend) => <SidebarUser key={friend.id} user={friend} openUser={openUser} />);
    return groupFriends(friends).map((group) => (
        <div key={group.location}>
            <div className="mb-1 mt-2 flex items-center text-xs text-muted-foreground">
                <span className="truncate">{group.location}</span>
                <span className="ml-1">({group.friends.length})</span>
            </div>
            {group.friends.map((friend) => (
                <SidebarUser key={friend.id} user={friend} openUser={openUser} />
            ))}
        </div>
    ));
}

function groupFriends(friends: VrchatUser[]) {
    const groups = new Map<string, VrchatUser[]>();
    for (const friend of friends) groups.set(locationLabel(friend), [...(groups.get(locationLabel(friend)) ?? []), friend]);
    return [...groups].map(([location, members]) => ({ location, friends: members })).toSorted((a, b) => a.location.localeCompare(b.location));
}

function GroupList({ groups, search, openGroup }: { groups: VrchatGroup[]; search: string; openGroup: (groupId: string) => void }) {
    const query = search.trim().toLocaleLowerCase();
    const visible = groups.filter((group) => !query || `${group.name} ${group.shortCode || ""} ${group.description || ""}`.toLocaleLowerCase().includes(query));
    return (
        <div className="pt-2">
            {visible.map((group) => (
                <button key={group.id} type="button" onClick={() => openGroup(group.id)} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-[13px] hover:bg-muted/50">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                        <VrchatImage src={group.iconUrl} alt="" className="size-full object-cover" fallback={<User className="size-4 text-muted-foreground" />} />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate font-medium">{group.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{group.shortCode || `${group.memberCount ?? 0} members`}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}
