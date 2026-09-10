"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, RefreshCw, Search, Settings, User } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { VrchatImage } from "@/components/vrchat-image";
import { loadFavoriteFriendIds } from "@/lib/friend-favorites-client";
import { locationLabel } from "@/lib/friends";
import { groupSidebarFriendInstances, type SidebarSortMethod, sidebarSortMethods, sortSidebarFriends } from "@/lib/sidebar-friends";
import type { VrchatGroup, VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type SectionKey = "active" | "favorite" | "me" | "offline" | "online" | "same-instance";
type SidebarTab = "friends" | "groups";

export function FriendsSidebar() {
    const currentUser = useCurrentUser();
    const { friends, allFriends, loading, refresh, openUser, openGroup } = useFriends();
    const [search, setSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [groupByInstance, setGroupByInstance] = useState(true);
    const [hideGroupedFriends, setHideGroupedFriends] = useState(false);
    const [sameInstanceAboveFavorites, setSameInstanceAboveFavorites] = useState(false);
    const [sortMethods, setSortMethods] = useState<SidebarSortMethod[]>(["Sort Private to Bottom", "Sort by Last Active"]);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
    const [tab, setTab] = useState<SidebarTab>("friends");
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [groups, setGroups] = useState<VrchatGroup[]>([]);
    const [notificationLayout, setNotificationLayout] = useState<"notification-center" | "table">("notification-center");
    const searchRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function loadSidebarData() {
            const [settingsResponse, favoriteIds, groupsResponse] = await Promise.all([fetch("/api/settings", { cache: "no-store", signal: controller.signal }), loadFavoriteFriendIds(controller.signal), fetch("/api/groups", { cache: "no-store", signal: controller.signal })]);
            const settings = (await settingsResponse.json()) as {
                sidebarGroupByInstance?: boolean;
                sidebarHideGroupedFriends?: boolean;
                sidebarSameInstanceAboveFavorites?: boolean;
                sidebarSortMethods?: SidebarSortMethod[];
                sidebarCollapsedSections?: SectionKey[];
                sidebarTab?: SidebarTab;
                notificationLayout?: "notification-center" | "table";
            };
            const groupPayload = (await groupsResponse.json()) as { groups?: VrchatGroup[] };
            setGroupByInstance(settings.sidebarGroupByInstance === true);
            setHideGroupedFriends(settings.sidebarHideGroupedFriends === true);
            setSameInstanceAboveFavorites(settings.sidebarSameInstanceAboveFavorites === true);
            setSortMethods(settings.sidebarSortMethods ?? ["Sort Private to Bottom", "Sort by Last Active"]);
            setCollapsed(new Set(settings.sidebarCollapsedSections ?? []));
            setTab(settings.sidebarTab ?? "friends");
            setNotificationLayout(settings.notificationLayout ?? "notification-center");
            setFavoriteIds(favoriteIds);
            setGroups(groupPayload.groups ?? []);
        }
        void loadSidebarData().catch(() => undefined);
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!settingsOpen) return;
        function closeSettings(event: MouseEvent | KeyboardEvent) {
            if (event instanceof KeyboardEvent) {
                if (event.key === "Escape") {
                    setSettingsOpen(false);
                    requestAnimationFrame(() => settingsButtonRef.current?.focus());
                }
                return;
            }
            if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
        }
        document.addEventListener("mousedown", closeSettings);
        document.addEventListener("keydown", closeSettings);
        return () => {
            document.removeEventListener("mousedown", closeSettings);
            document.removeEventListener("keydown", closeSettings);
        };
    }, [settingsOpen]);

    useEffect(() => {
        function applySettings(event: Event) {
            const value = (event as CustomEvent<{ notificationLayout?: "notification-center" | "table" }>).detail?.notificationLayout;
            if (value) setNotificationLayout(value);
        }
        window.addEventListener("vrcx:settings-saved", applySettings);
        return () => window.removeEventListener("vrcx:settings-saved", applySettings);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        function refreshFavoriteGroups(event: Event) {
            const detail = (event as CustomEvent<Record<string, unknown>>).detail;
            if (!("localFavoriteFriendsGroups" in detail)) return;
            void loadFavoriteFriendIds(controller.signal)
                .then(setFavoriteIds)
                .catch(() => undefined);
        }
        window.addEventListener("vrcx:settings-saved", refreshFavoriteGroups);
        return () => {
            controller.abort();
            window.removeEventListener("vrcx:settings-saved", refreshFavoriteGroups);
        };
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
        const matchedOnline = friends.filter(matches);
        const instanceGroups = groupByInstance ? groupSidebarFriendInstances(matchedOnline, sortMethods) : [];
        const groupedIds = new Set(instanceGroups.flatMap((group) => group.friends.map((friend) => friend.id)));
        const visibleOutsideGroups = (friend: VrchatUser) => !hideGroupedFriends || !groupedIds.has(friend.id);
        const favorite = sortSidebarFriends(
            matchedOnline.filter((friend) => favoriteIds.has(friend.id) && visibleOutsideGroups(friend)),
            sortMethods,
        );
        const online = sortSidebarFriends(
            matchedOnline.filter((friend) => !favoriteIds.has(friend.id) && visibleOutsideGroups(friend)),
            sortMethods,
        );
        const active = sortSidebarFriends(
            allFriends.filter((friend) => friend.state === "active" && matches(friend)),
            sortMethods,
        );
        const offline = sortSidebarFriends(
            allFriends.filter((friend) => !onlineIds.has(friend.id) && friend.state !== "active" && matches(friend)),
            sortMethods,
        );
        return { favorite, online, active, offline, instanceGroups };
    }, [allFriends, favoriteIds, friends, groupByInstance, hideGroupedFriends, search, sortMethods]);

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

    function changeSortMethod(index: number, value: SidebarSortMethod | "") {
        const next = [...sortMethods];
        if (!value) next.splice(index);
        else next[index] = value;
        const unique = next.filter((method, methodIndex) => method && next.indexOf(method) === methodIndex).slice(0, 3);
        setSortMethods(unique);
        save({ sidebarSortMethods: unique });
    }

    const sameInstanceSection =
        groupByInstance && sections.instanceGroups.length ? (
            <SidebarSection label="Same Instance" section="same-instance" count={sections.instanceGroups.length} collapsed={collapsed.has("same-instance")} toggle={toggleSection}>
                {sections.instanceGroups.map((group) => (
                    <div key={group.location}>
                        <div className="mt-2 mb-1 flex items-center px-1.5 text-xs text-muted-foreground">
                            <span className="truncate">{group.label}</span>
                            <span className="ml-1">({group.friends.length})</span>
                        </div>
                        {renderFriends(group.friends, openUser)}
                    </div>
                ))}
            </SidebarSection>
        ) : null;

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
                <NotificationCenter layout={notificationLayout} friends={allFriends} openUser={openUser} openGroup={openGroup} />
                <div ref={settingsRef} className="relative">
                    <button ref={settingsButtonRef} type="button" onClick={() => setSettingsOpen((value) => !value)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent" aria-label="Sidebar settings" aria-haspopup="dialog" aria-expanded={settingsOpen}>
                        <Settings className="size-4" />
                    </button>
                    {settingsOpen ? (
                        <div role="dialog" aria-label="Sidebar settings" className="absolute top-10 right-0 z-30 w-72 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
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
                            {groupByInstance ? (
                                <>
                                    <label className="mt-3 flex items-center justify-between gap-3">
                                        <span>Hide Grouped Friends</span>
                                        <input
                                            type="checkbox"
                                            checked={hideGroupedFriends}
                                            onChange={(event) => {
                                                setHideGroupedFriends(event.target.checked);
                                                save({ sidebarHideGroupedFriends: event.target.checked });
                                            }}
                                            className="size-4 accent-primary"
                                        />
                                    </label>
                                    <label className="mt-3 flex items-center justify-between gap-3">
                                        <span>Prioritize Same Instance</span>
                                        <input
                                            type="checkbox"
                                            checked={sameInstanceAboveFavorites}
                                            onChange={(event) => {
                                                setSameInstanceAboveFavorites(event.target.checked);
                                                save({ sidebarSameInstanceAboveFavorites: event.target.checked });
                                            }}
                                            className="size-4 accent-primary"
                                        />
                                    </label>
                                </>
                            ) : null}
                            <div className="my-3 border-t border-border" />
                            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen} className="flex w-full items-center gap-1 py-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                <ChevronDown className={`size-3.5 transition-transform ${advancedOpen ? "" : "-rotate-90"}`} />
                                Advanced
                            </button>
                            {advancedOpen ? (
                                <div className="mt-2 space-y-2">
                                    {[0, 1, 2].map((index) => (
                                        <label key={index} className="block">
                                            <span className="sr-only">Sort method {index + 1}</span>
                                            <select
                                                value={sortMethods[index] ?? ""}
                                                disabled={index > 0 && sortMethods.length < index}
                                                onChange={(event) => changeSortMethod(index, event.target.value as SidebarSortMethod | "")}
                                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring disabled:opacity-50"
                                            >
                                                {index ? <option value="">None</option> : null}
                                                {sidebarSortMethods.map((method) => (
                                                    <option key={method} value={method} disabled={sortMethods.includes(method) && sortMethods[index] !== method}>
                                                        {method}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    ))}
                                </div>
                            ) : null}
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
                        {sameInstanceAboveFavorites ? sameInstanceSection : null}
                        <SidebarSection label="Favorites" section="favorite" count={sections.favorite.length} collapsed={collapsed.has("favorite")} toggle={toggleSection}>
                            {renderFriends(sections.favorite, openUser)}
                        </SidebarSection>
                        {!sameInstanceAboveFavorites ? sameInstanceSection : null}
                        <SidebarSection label="Online" section="online" count={sections.online.length} collapsed={collapsed.has("online")} toggle={toggleSection}>
                            {renderFriends(sections.online, openUser)}
                        </SidebarSection>
                        <SidebarSection label="Active" section="active" count={sections.active.length} collapsed={collapsed.has("active")} toggle={toggleSection}>
                            {renderFriends(sections.active, openUser)}
                        </SidebarSection>
                        <SidebarSection label="Offline" section="offline" count={sections.offline.length} collapsed={collapsed.has("offline")} toggle={toggleSection}>
                            {renderFriends(sections.offline, openUser)}
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

function renderFriends(friends: VrchatUser[], openUser: (userId: string) => void) {
    return friends.map((friend) => <SidebarUser key={friend.id} user={friend} openUser={openUser} />);
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
