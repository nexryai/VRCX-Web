"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, RefreshCw, Search, Settings, Users } from "lucide-react";

import { useAgeGatedInstancesVisible, useShowInstanceIdInLocation } from "@/components/appearance-settings-provider";
import { useCurrentUser } from "@/components/current-user-provider";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { VrchatImage } from "@/components/vrchat-image";
import { loadSidebarFavoriteFriendGroups } from "@/lib/friend-favorites-client";
import { locationLabel } from "@/lib/friends";
import { normalizeSidebarFavoriteGroupKeys, orderSidebarFavoriteGroups, resolveSidebarFavoriteGroupKeys, type SidebarFavoriteGroup } from "@/lib/sidebar-favorite-groups";
import { groupSidebarFriendInstances, type SidebarSortMethod, sidebarSortMethods, sortSidebarFriends } from "@/lib/sidebar-friends";
import type { VrchatCosmeticIconFrame, VrchatGroup, VrchatGroupInstance, VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type SectionKey = "active" | "favorite" | "me" | "offline" | "online" | "same-instance";
type SidebarTab = "friends" | "groups";
type SidebarGroupInstances = { group: VrchatGroup; instances: VrchatGroupInstance[]; sidebarOrder?: number; observedAt: string };

export function FriendsSidebar() {
    const showAgeGatedInstances = useAgeGatedInstancesVisible();
    const showInstanceId = useShowInstanceIdInLocation();
    const currentUser = useCurrentUser();
    const { friends, allFriends, loading, refresh, openUser, openGroup } = useFriends();
    const [search, setSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [groupByInstance, setGroupByInstance] = useState(true);
    const [hideGroupedFriends, setHideGroupedFriends] = useState(false);
    const [sameInstanceAboveFavorites, setSameInstanceAboveFavorites] = useState(false);
    const [divideByFavoriteGroup, setDivideByFavoriteGroup] = useState(true);
    const [showCosmetics, setShowCosmetics] = useState(false);
    const [iconFrames, setIconFrames] = useState<VrchatCosmeticIconFrame[]>([]);
    const [favoriteGroups, setFavoriteGroups] = useState<SidebarFavoriteGroup[]>([]);
    const [selectedFavoriteGroups, setSelectedFavoriteGroups] = useState<string[]>([]);
    const [favoriteGroupOrder, setFavoriteGroupOrder] = useState<string[]>([]);
    const [favoriteGroupOrderOpen, setFavoriteGroupOrderOpen] = useState(false);
    const [collapsedFavoriteGroups, setCollapsedFavoriteGroups] = useState<Set<string>>(new Set());
    const [sortMethods, setSortMethods] = useState<SidebarSortMethod[]>(["Sort Private to Bottom", "Sort by Last Active"]);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
    const [tab, setTab] = useState<SidebarTab>("friends");
    const [sidebarGroups, setSidebarGroups] = useState<SidebarGroupInstances[]>([]);
    const [notificationLayout, setNotificationLayout] = useState<"notification-center" | "table">("notification-center");
    const searchRef = useRef<HTMLInputElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function loadSidebarData() {
            const [settingsResponse, favoriteGroups, groupsResponse, iconFramesResponse] = await Promise.all([
                fetch("/api/settings", { cache: "no-store", signal: controller.signal }),
                loadSidebarFavoriteFriendGroups(controller.signal),
                fetch("/api/groups?scope=sidebar", { cache: "no-store", signal: controller.signal }),
                fetch("/api/cosmetics/icon-frames", { cache: "no-store", signal: controller.signal }),
            ]);
            const settings = (await settingsResponse.json()) as {
                sidebarGroupByInstance?: boolean;
                sidebarHideGroupedFriends?: boolean;
                sidebarSameInstanceAboveFavorites?: boolean;
                sidebarDivideByFriendGroup?: boolean;
                sidebarCosmetics?: boolean;
                sidebarFavoriteGroups?: string[];
                sidebarFavoriteGroupOrder?: string[];
                sidebarSortMethods?: SidebarSortMethod[];
                sidebarCollapsedSections?: SectionKey[];
                sidebarTab?: SidebarTab;
                notificationLayout?: "notification-center" | "table";
            };
            const groupPayload = (await groupsResponse.json()) as { groups?: SidebarGroupInstances[] };
            const iconFramePayload = (await iconFramesResponse.json()) as { frames?: VrchatCosmeticIconFrame[] };
            setGroupByInstance(settings.sidebarGroupByInstance === true);
            setHideGroupedFriends(settings.sidebarHideGroupedFriends === true);
            setSameInstanceAboveFavorites(settings.sidebarSameInstanceAboveFavorites === true);
            setDivideByFavoriteGroup(settings.sidebarDivideByFriendGroup !== false);
            setShowCosmetics(settings.sidebarCosmetics === true);
            setIconFrames(iconFramePayload.frames ?? []);
            setSelectedFavoriteGroups(settings.sidebarFavoriteGroups ?? []);
            setFavoriteGroupOrder(settings.sidebarFavoriteGroupOrder ?? []);
            setSortMethods(settings.sidebarSortMethods ?? ["Sort Private to Bottom", "Sort by Last Active"]);
            setCollapsed(new Set(settings.sidebarCollapsedSections ?? []));
            setTab(settings.sidebarTab ?? "friends");
            setNotificationLayout(settings.notificationLayout ?? "notification-center");
            setFavoriteGroups(favoriteGroups);
            setSidebarGroups(groupPayload.groups ?? []);
        }
        void loadSidebarData().catch(() => undefined);
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!settingsOpen) return;
        function closeSettings(event: MouseEvent | KeyboardEvent) {
            if (event instanceof KeyboardEvent) {
                if (event.key === "Escape") {
                    if (event.target instanceof Element && event.target.closest("details")) return;
                    const openDetails = settingsRef.current?.querySelector<HTMLDetailsElement>("details[open]");
                    if (openDetails) {
                        openDetails.open = false;
                        openDetails.querySelector("summary")?.focus();
                        return;
                    }
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
            void loadSidebarFavoriteFriendGroups(controller.signal)
                .then(setFavoriteGroups)
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
        const matches = (friend: VrchatUser) => !query || `${friend.displayName} ${friend.statusDescription || ""} ${locationLabel(friend, showAgeGatedInstances, showInstanceId)}`.toLocaleLowerCase().includes(query);
        const onlineIds = new Set(friends.map((friend) => friend.id));
        const matchedOnline = friends.filter(matches);
        const instanceGroups = groupByInstance ? groupSidebarFriendInstances(matchedOnline, sortMethods, showAgeGatedInstances, showInstanceId) : [];
        const groupedIds = new Set(instanceGroups.flatMap((group) => group.friends.map((friend) => friend.id)));
        const visibleOutsideGroups = (friend: VrchatUser) => !hideGroupedFriends || !groupedIds.has(friend.id);
        const selectedKeys = new Set(resolveSidebarFavoriteGroupKeys(selectedFavoriteGroups, favoriteGroups));
        const selectedGroups = orderSidebarFavoriteGroups(
            favoriteGroups.filter((group) => selectedKeys.has(group.key)),
            favoriteGroupOrder,
        );
        const selectedFavoriteIds = new Set(selectedGroups.flatMap((group) => group.friendIds));
        const favorite = sortSidebarFriends(
            matchedOnline.filter((friend) => selectedFavoriteIds.has(friend.id) && visibleOutsideGroups(friend)),
            sortMethods,
        );
        const friendById = new Map(favorite.map((friend) => [friend.id, friend]));
        const dividedFavorites = selectedGroups
            .map((group) => ({
                ...group,
                friends: sortSidebarFriends(
                    group.friendIds.flatMap((friendId) => {
                        const friend = friendById.get(friendId);
                        return friend ? [friend] : [];
                    }),
                    sortMethods,
                ),
            }))
            .filter((group) => group.friends.length);
        const online = sortSidebarFriends(
            matchedOnline.filter((friend) => !selectedFavoriteIds.has(friend.id) && visibleOutsideGroups(friend)),
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
        return { favorite, dividedFavorites, favoriteCount: divideByFavoriteGroup ? dividedFavorites.reduce((count, group) => count + group.friends.length, 0) : favorite.length, online, active, offline, instanceGroups };
    }, [allFriends, divideByFavoriteGroup, favoriteGroupOrder, favoriteGroups, friends, groupByInstance, hideGroupedFriends, search, selectedFavoriteGroups, showAgeGatedInstances, showInstanceId, sortMethods]);

    const iconFramesById = useMemo(() => new Map(iconFrames.map((frame) => [frame.id, frame])), [iconFrames]);

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

    function changeFavoriteGroups(keys: string[]) {
        const normalized = normalizeSidebarFavoriteGroupKeys(keys, favoriteGroups);
        setSelectedFavoriteGroups(normalized);
        save({ sidebarFavoriteGroups: normalized });
    }

    function toggleFavoriteGroupCollapsed(key: string) {
        setCollapsedFavoriteGroups((current) => {
            const next = new Set(current);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
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
                        {renderFriends(group.friends, openUser, showCosmetics, iconFramesById)}
                    </div>
                ))}
            </SidebarSection>
        ) : null;

    return (
        <>
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
                                <label className="mt-3 flex items-center justify-between gap-3">
                                    <span>Split Favorite Friends</span>
                                    <input
                                        type="checkbox"
                                        checked={divideByFavoriteGroup}
                                        onChange={(event) => {
                                            setDivideByFavoriteGroup(event.target.checked);
                                            save({ sidebarDivideByFriendGroup: event.target.checked });
                                        }}
                                        className="size-4 accent-primary"
                                    />
                                </label>
                                <label className="mt-3 flex items-center justify-between gap-3">
                                    <span>Show Cosmetics</span>
                                    <input
                                        type="checkbox"
                                        checked={showCosmetics}
                                        onChange={(event) => {
                                            setShowCosmetics(event.target.checked);
                                            save({ sidebarCosmetics: event.target.checked });
                                        }}
                                        className="size-4 accent-primary"
                                    />
                                </label>
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
                                        <div className="border-t border-border pt-2">
                                            <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">Favorites</p>
                                            <SidebarFavoriteGroupSelector groups={favoriteGroups} selected={resolveSidebarFavoriteGroupKeys(selectedFavoriteGroups, favoriteGroups)} change={changeFavoriteGroups} />
                                            {divideByFavoriteGroup ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSettingsOpen(false);
                                                        setFavoriteGroupOrderOpen(true);
                                                    }}
                                                    className="mt-2 h-8 w-full rounded-md border border-input text-xs hover:bg-muted"
                                                >
                                                    Edit Group Order
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="mb-1 flex shrink-0 rounded-md bg-muted p-1" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "friends"} onClick={() => selectTab("friends")} className={`h-7 flex-1 rounded-sm text-xs font-medium ${tab === "friends" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                        Friends{" "}
                        <span className="ml-2">
                            ({friends.length}/{allFriends.length})
                        </span>
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "groups"} onClick={() => selectTab("groups")} className={`h-7 flex-1 rounded-sm text-xs font-medium ${tab === "groups" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                        Groups <span className="ml-2">({sidebarGroups.reduce((count, group) => count + group.instances.length, 0)})</span>
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                    {tab === "groups" ? (
                        <GroupList groups={sidebarGroups} search={search} openGroup={openGroup} />
                    ) : (
                        <>
                            <SidebarSection label="Me" section="me" count={1} collapsed={collapsed.has("me")} toggle={toggleSection}>
                                <SidebarUser user={currentUser} openUser={openUser} showCosmetics={showCosmetics} iconFrames={iconFramesById} />
                            </SidebarSection>
                            {sameInstanceAboveFavorites ? sameInstanceSection : null}
                            {sections.favoriteCount ? (
                                <SidebarSection label="Favorites" section="favorite" count={sections.favoriteCount} collapsed={collapsed.has("favorite")} toggle={toggleSection}>
                                    {divideByFavoriteGroup
                                        ? sections.dividedFavorites.map((group) => (
                                              <FavoriteGroupSection key={group.key} group={group} collapsed={collapsedFavoriteGroups.has(group.key)} toggle={() => toggleFavoriteGroupCollapsed(group.key)} openUser={openUser} showCosmetics={showCosmetics} iconFrames={iconFramesById} />
                                          ))
                                        : renderFriends(sections.favorite, openUser, showCosmetics, iconFramesById)}
                                </SidebarSection>
                            ) : null}
                            {!sameInstanceAboveFavorites ? sameInstanceSection : null}
                            {sections.online.length ? (
                                <SidebarSection label="Online" section="online" count={sections.online.length} collapsed={collapsed.has("online")} toggle={toggleSection}>
                                    {renderFriends(sections.online, openUser, showCosmetics, iconFramesById)}
                                </SidebarSection>
                            ) : null}
                            {sections.active.length ? (
                                <SidebarSection label="Active" section="active" count={sections.active.length} collapsed={collapsed.has("active")} toggle={toggleSection}>
                                    {renderFriends(sections.active, openUser, showCosmetics, iconFramesById)}
                                </SidebarSection>
                            ) : null}
                            {sections.offline.length ? (
                                <SidebarSection label="Offline" section="offline" count={sections.offline.length} collapsed={collapsed.has("offline")} toggle={toggleSection}>
                                    {renderFriends(sections.offline, openUser, showCosmetics, iconFramesById)}
                                </SidebarSection>
                            ) : null}
                        </>
                    )}
                </div>
            </aside>
            {favoriteGroupOrderOpen ? (
                <FavoriteGroupOrderDialog
                    groups={orderSidebarFavoriteGroups(
                        favoriteGroups.filter((group) => new Set(resolveSidebarFavoriteGroupKeys(selectedFavoriteGroups, favoriteGroups)).has(group.key)),
                        favoriteGroupOrder,
                    )}
                    persistedOrder={favoriteGroupOrder}
                    close={() => setFavoriteGroupOrderOpen(false)}
                    reset={() => {
                        setFavoriteGroupOrder([]);
                        save({ sidebarFavoriteGroupOrder: [] });
                    }}
                    confirm={(order) => {
                        setFavoriteGroupOrder(order);
                        save({ sidebarFavoriteGroupOrder: order });
                        setFavoriteGroupOrderOpen(false);
                    }}
                    returnFocus={settingsButtonRef}
                />
            ) : null}
        </>
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

function FavoriteGroupSection({ group, collapsed, toggle, openUser, showCosmetics, iconFrames }: { group: SidebarFavoriteGroup & { friends: VrchatUser[] }; collapsed: boolean; toggle: () => void; openUser: (userId: string) => void; showCosmetics: boolean; iconFrames: Map<string, VrchatCosmeticIconFrame> }) {
    return (
        <div>
            <button type="button" onClick={toggle} className="flex w-full items-center pt-1 pb-1 pl-1 text-xs">
                <ChevronDown className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                <span className="ml-1.5 min-w-0 truncate">
                    {group.displayName} ― {group.friends.length}
                </span>
            </button>
            {collapsed ? null : <div className="pb-2">{renderFriends(group.friends, openUser, showCosmetics, iconFrames)}</div>}
        </div>
    );
}

function SidebarFavoriteGroupSelector({ groups, selected, change }: { groups: SidebarFavoriteGroup[]; selected: string[]; change: (keys: string[]) => void }) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const selectedSet = new Set(selected);
    const labels = groups.filter((group) => selectedSet.has(group.key)).map((group) => group.displayName);
    return (
        <details
            ref={detailsRef}
            className="group relative"
            onKeyDown={(event) => {
                if (event.key !== "Escape" || !detailsRef.current?.open) return;
                event.preventDefault();
                event.stopPropagation();
                detailsRef.current.open = false;
                detailsRef.current.querySelector("summary")?.focus();
            }}
        >
            <summary className="flex h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-input bg-background px-2 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
                <span className={`min-w-0 truncate ${labels.length ? "" : "text-muted-foreground"}`}>{labels.length ? labels.join(", ") : "Favorite Groups"}</span>
                {labels.length > 1 ? <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">+{labels.length - 1}</span> : null}
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div role="menu" aria-label="Sidebar Favorite Groups" className="absolute top-9 right-0 z-40 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                {groups.length ? (
                    groups.map((group, index) => (
                        <div key={group.key}>
                            {index > 0 && group.local && !groups[index - 1]?.local ? <div className="my-1 border-t border-border" /> : null}
                            <button
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={selectedSet.has(group.key)}
                                onClick={() => change(selectedSet.has(group.key) ? selected.filter((key) => key !== group.key) : [...selected, group.key])}
                                className="flex min-h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted"
                            >
                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input">{selectedSet.has(group.key) ? <Check className="size-3" /> : null}</span>
                                <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                                {group.local ? <span className="text-[10px] text-muted-foreground">Local</span> : null}
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="px-2 py-3 text-muted-foreground">No favorite groups</p>
                )}
            </div>
        </details>
    );
}

function FavoriteGroupOrderDialog({ groups, persistedOrder, close, reset, confirm, returnFocus }: { groups: SidebarFavoriteGroup[]; persistedOrder: string[]; close: () => void; reset: () => void; confirm: (order: string[]) => void; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
    const [ordered, setOrdered] = useState(groups);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dialogRef.current?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") close();
            if (event.key !== "Tab" || !dialogRef.current) return;
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => {
            window.removeEventListener("keydown", handleKey);
            returnFocus.current?.focus();
        };
    }, [close, returnFocus]);

    function move(index: number, offset: -1 | 1) {
        setOrdered((current) => {
            const next = [...current];
            const target = index + offset;
            if (!next[index] || !next[target]) return current;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    return (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit Group Order" tabIndex={-1} className="flex max-h-[80vh] w-80 flex-col rounded-lg border border-border bg-popover p-4 shadow-2xl outline-none">
                <h2 className="text-base font-semibold">Edit Group Order</h2>
                <div className="my-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                    {ordered.map((group, index) => (
                        <div key={group.key} className="flex items-center gap-2 rounded-md border border-border bg-background p-2 text-sm">
                            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label={`Move ${group.displayName} up`}>
                                <ArrowUp className="size-3.5" />
                            </button>
                            <button type="button" onClick={() => move(index, 1)} disabled={index === ordered.length - 1} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30" aria-label={`Move ${group.displayName} down`}>
                                <ArrowDown className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            reset();
                            setOrdered(groups.toSorted((left, right) => left.key.localeCompare(right.key)));
                        }}
                        className="h-8 rounded-md bg-secondary px-3 text-xs hover:brightness-110"
                    >
                        Reset
                    </button>
                    <button type="button" onClick={() => confirm([...ordered.map((group) => group.key), ...persistedOrder.filter((key) => !ordered.some((group) => group.key === key))])} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:brightness-110">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

function SidebarUser({ user, openUser, showCosmetics, iconFrames }: { user: VrchatUser; openUser: (userId: string) => void; showCosmetics: boolean; iconFrames: Map<string, VrchatCosmeticIconFrame> }) {
    const showAgeGatedInstances = useAgeGatedInstancesVisible();
    const showInstanceId = useShowInstanceIdInLocation();
    return (
        <button type="button" onClick={() => openUser(user.id)} className="flex w-full items-center p-1.5 text-left text-[13px] hover:rounded-lg hover:bg-muted/50">
            <FriendAvatar friend={user} iconFrame={showCosmetics && user.iconFrame ? iconFrames.get(user.iconFrame) : undefined} />
            <span className="ml-2.5 min-w-0 flex-1">
                <span className="block truncate font-medium leading-[18px]">{user.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{locationLabel(user, showAgeGatedInstances, showInstanceId) || user.statusDescription}</span>
            </span>
        </button>
    );
}

function renderFriends(friends: VrchatUser[], openUser: (userId: string) => void, showCosmetics: boolean, iconFrames: Map<string, VrchatCosmeticIconFrame>) {
    return friends.map((friend) => <SidebarUser key={friend.id} user={friend} openUser={openUser} showCosmetics={showCosmetics} iconFrames={iconFrames} />);
}

function GroupList({ groups, search, openGroup }: { groups: SidebarGroupInstances[]; search: string; openGroup: (groupId: string) => void }) {
    const showAgeGatedInstances = useAgeGatedInstancesVisible();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const query = search.trim().toLocaleLowerCase();
    const visible = groups
        .map((section) => ({
            ...section,
            visibleInstances: section.instances.filter((instance) => (showAgeGatedInstances || !instance.location.includes("~ageGate")) && (!query || `${section.group.name} ${instance.world.name} ${instance.displayName || ""} ${instance.location}`.toLocaleLowerCase().includes(query))),
        }))
        .filter((section) => !query || section.visibleInstances.length || `${section.group.name} ${section.group.shortCode || ""}`.toLocaleLowerCase().includes(query));

    function toggle(groupId: string) {
        setCollapsed((current) => {
            const next = new Set(current);
            next.has(groupId) ? next.delete(groupId) : next.add(groupId);
            return next;
        });
    }

    return (
        <div className="px-0.5 py-2.5">
            {visible.map((section, index) => (
                <section key={section.group.id}>
                    <button type="button" onClick={() => toggle(section.group.id)} className={`flex w-full items-center pb-1.5 text-xs ${index ? "pt-2.5" : ""}`}>
                        <ChevronDown className={`size-4 transition-transform ${collapsed.has(section.group.id) ? "-rotate-90" : ""}`} />
                        <span className="ml-1.5 truncate">
                            {section.group.name} – {section.instances.length}
                        </span>
                    </button>
                    {collapsed.has(section.group.id)
                        ? null
                        : section.visibleInstances.map((instance) => (
                              <button key={instance.id} type="button" onClick={() => openGroup(instance.ownerId)} className="flex w-full items-center p-1.5 text-left text-[13px] hover:rounded-lg hover:bg-muted/50">
                                  <span className="mr-2.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                      <VrchatImage src={section.group.iconUrl} alt="" className="size-full object-cover" fallback={<Users className="size-4 text-muted-foreground" />} />
                                  </span>
                                  <span className="min-w-0 flex-1 overflow-hidden">
                                      <span className="block truncate font-medium leading-[18px]">
                                          {section.group.name}{" "}
                                          <span className="ml-1.5 font-normal">
                                              ({instance.userCount ?? 0}/{instance.capacity ?? 0})
                                          </span>
                                      </span>
                                      <span className="block truncate text-xs text-muted-foreground" title={instance.location}>
                                          {instance.world.name}
                                          {instance.displayName ? ` · #${instance.displayName}` : ""}
                                      </span>
                                  </span>
                              </button>
                          ))}
                </section>
            ))}
        </div>
    );
}
