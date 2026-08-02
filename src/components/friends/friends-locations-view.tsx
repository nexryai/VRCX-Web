"use client";

import { useEffect, useMemo, useState } from "react";

import { Pencil, Search, Settings, Users } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { groupFriendsByLocation, locationLabel, statusColor } from "@/lib/friends";
import type { VrchatFavorite, VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type Segment = "active" | "favorite" | "offline" | "online" | "same-instance";
type LocationSettings = {
    friendLocationCardScale: number;
    friendLocationCardSpacing: number;
    friendLocationShowSameInstance: boolean;
    friendLocationSegment: Segment;
};

const segmentLabels: Array<{ label: string; value: Segment }> = [
    { label: "Online", value: "online" },
    { label: "Favorite", value: "favorite" },
    { label: "Same Instance", value: "same-instance" },
    { label: "Active", value: "active" },
    { label: "Offline", value: "offline" },
];
const skeletonIds = ["friend-a", "friend-b", "friend-c", "friend-d", "friend-e", "friend-f", "friend-g", "friend-h"];

function saveSettings(update: Partial<LocationSettings>) {
    void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
}

async function loadFavoriteFriendIds(signal: AbortSignal) {
    const ids = new Set<string>();
    for (let offset = 0; offset < 5_000; offset += 100) {
        const response = await fetch(`/api/favorites?section=records&offset=${offset}`, { cache: "no-store", signal });
        if (!response.ok) break;
        const payload = (await response.json()) as { favorites?: VrchatFavorite[] };
        const page = payload.favorites ?? [];
        for (const favorite of page) if (favorite.type === "friend") ids.add(favorite.favoriteId);
        if (page.length < 100) break;
    }
    return ids;
}

export function FriendsLocationsView() {
    const currentUser = useCurrentUser();
    const { friends, allFriends, loading, error, openUser } = useFriends();
    const [search, setSearch] = useState("");
    const [segment, setSegment] = useState<Segment>("online");
    const [scale, setScale] = useState(1);
    const [spacing, setSpacing] = useState(1);
    const [showSameInstance, setShowSameInstance] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsReady, setSettingsReady] = useState(false);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const controller = new AbortController();
        void Promise.all([fetch("/api/settings", { cache: "no-store", signal: controller.signal }).then((response) => response.json() as Promise<Partial<LocationSettings>>), loadFavoriteFriendIds(controller.signal)])
            .then(([settings, ids]) => {
                const includeSameInstance = settings.friendLocationShowSameInstance === true;
                setScale(settings.friendLocationCardScale ?? 1);
                setSpacing(settings.friendLocationCardSpacing ?? 1);
                setShowSameInstance(includeSameInstance);
                setSegment(settings.friendLocationSegment === "same-instance" && !includeSameInstance ? "online" : (settings.friendLocationSegment ?? "online"));
                setFavoriteIds(ids);
                setSettingsReady(true);
            })
            .catch(() => setSettingsReady(true));
        return () => controller.abort();
    }, []);

    const selectedFriends = useMemo(() => {
        const onlineIds = new Set(friends.map((friend) => friend.id));
        if (segment === "favorite") return friends.filter((friend) => favoriteIds.has(friend.id));
        if (segment === "same-instance") {
            const ownLocation = currentUser.location || currentUser.travelingToLocation;
            return ownLocation ? friends.filter((friend) => (friend.location || friend.travelingToLocation) === ownLocation) : [];
        }
        if (segment === "active") return allFriends.filter((friend) => friend.state === "active");
        if (segment === "offline") return allFriends.filter((friend) => !onlineIds.has(friend.id));
        return friends;
    }, [allFriends, currentUser.location, currentUser.travelingToLocation, favoriteIds, friends, segment]);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) return selectedFriends;
        return selectedFriends.filter((friend) => `${friend.displayName} ${friend.statusDescription || ""} ${locationLabel(friend)}`.toLocaleLowerCase().includes(query));
    }, [search, selectedFriends]);
    const groups = useMemo(() => groupFriendsByLocation(filtered), [filtered]);
    const visibleSegments = showSameInstance ? segmentLabels : segmentLabels.filter((option) => option.value !== "same-instance");

    function selectSegment(value: Segment) {
        setSegment(value);
        saveSettings({ friendLocationSegment: value });
    }

    return (
        <section className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4 overflow-hidden p-2" aria-labelledby="friends-locations-heading">
            <div className="flex items-center gap-5 px-0.5 pt-2 max-lg:flex-wrap max-lg:gap-2">
                <div className="flex max-w-full shrink-0 items-center overflow-x-auto rounded-md bg-muted p-1" role="tablist" aria-label="Friend presence group">
                    {visibleSegments.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={segment === option.value}
                            onClick={() => selectSegment(option.value)}
                            className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors ${segment === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
                    <label className="relative w-60 min-w-40 max-sm:w-full">
                        <Search aria-hidden="true" className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-full rounded-md border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus:border-ring" placeholder="Search friends" />
                    </label>
                    <div className="relative">
                        <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent" aria-label="Friends Locations settings" aria-expanded={settingsOpen}>
                            <Settings className="size-4" />
                        </button>
                        {settingsOpen ? (
                            <div className="absolute top-10 right-0 z-30 grid w-[min(21.875rem,calc(100vw-2rem))] gap-3 rounded-md border border-border bg-popover p-4 text-[13px] shadow-lg">
                                <label className="flex items-center justify-between gap-3">
                                    <span className="font-medium">Separate same instance friends</span>
                                    <input
                                        type="checkbox"
                                        checked={showSameInstance}
                                        onChange={(event) => {
                                            const checked = event.target.checked;
                                            setShowSameInstance(checked);
                                            if (!checked && segment === "same-instance") selectSegment("online");
                                            saveSettings({ friendLocationShowSameInstance: checked });
                                        }}
                                        className="size-4 accent-primary"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-3">
                                    <span className="font-medium">Scale</span>
                                    <span className="ml-auto w-10 text-right text-xs font-semibold">{Math.round(scale * 100)}%</span>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="1"
                                        step="0.01"
                                        value={scale}
                                        onChange={(event) => setScale(Number(event.target.value))}
                                        onPointerUp={() => saveSettings({ friendLocationCardScale: scale })}
                                        onBlur={() => saveSettings({ friendLocationCardScale: scale })}
                                        className="w-40 accent-primary"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-3">
                                    <span className="font-medium">Spacing</span>
                                    <span className="ml-auto w-10 text-right text-xs font-semibold">{Math.round(spacing * 100)}%</span>
                                    <input
                                        type="range"
                                        min="0.25"
                                        max="1"
                                        step="0.05"
                                        value={spacing}
                                        onChange={(event) => setSpacing(Number(event.target.value))}
                                        onPointerUp={() => saveSettings({ friendLocationCardSpacing: spacing })}
                                        onBlur={() => saveSettings({ friendLocationCardSpacing: spacing })}
                                        className="w-40 accent-primary"
                                    />
                                </label>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-0.5">
                <h1 id="friends-locations-heading" className="sr-only">
                    Friends Locations
                </h1>
                {!settingsReady || (loading && allFriends.length === 0) ? <LoadingCards /> : null}
                {error ? <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
                {settingsReady && !loading && !error && groups.length === 0 ? (
                    <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
                        <span className="flex items-center gap-2">
                            <Users className="size-5" />
                            No matching friends
                        </span>
                    </div>
                ) : null}
                <div className="space-y-2">
                    {groups.map((group) => (
                        <section key={group.location} aria-label={group.location}>
                            <header className="flex items-center px-2 py-1 text-[13px] font-semibold">
                                <span className="truncate">{group.location}</span>
                                <span className="ml-1 text-xs font-normal">({group.members.length})</span>
                            </header>
                            <div className="grid justify-start p-0.5 max-sm:grid-cols-1" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${Math.round(200 * scale)}px,${Math.round(220 * scale)}px))`, gap: `${14 * scale * spacing}px` }}>
                                {group.members.map((friend) => (
                                    <FriendLocationCard key={friend.id} friend={friend} scale={scale} openUser={openUser} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </section>
    );
}

function FriendLocationCard({ friend, scale, openUser }: { friend: VrchatUser; scale: number; openUser: (userId: string) => void }) {
    return (
        <button type="button" onClick={() => openUser(friend.id)} className="relative min-w-0 rounded-md border border-border bg-card text-left hover:bg-muted" style={{ padding: `${8 * scale}px`, paddingBottom: `${6 * scale}px` }}>
            <span className="absolute rounded-full shadow-[0_0_8px_color-mix(in_oklch,var(--status-online)_40%,transparent)]" style={{ top: 8 * scale, right: 8 * scale, width: 12 * scale, height: 12 * scale, background: statusColor(friend.status) }} aria-hidden="true" />
            <div className="mb-[7px] flex min-w-0 items-center" style={{ gap: 10 * scale }}>
                <span className="inline-flex shrink-0" style={{ transform: `scale(${scale})`, transformOrigin: "left center", width: 36 * scale, height: 36 * scale }}>
                    <FriendAvatar friend={friend} showStatus={false} />
                </span>
                <span className="min-w-0 truncate font-semibold" style={{ fontSize: 13 * scale }} title={friend.displayName}>
                    {friend.displayName}
                </span>
            </div>
            <div className="grid" style={{ gap: 8 * scale }}>
                <div className="flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground" style={{ padding: `${7 * scale}px ${8 * scale}px`, fontSize: 12 * scale, lineHeight: 1.4 }} title={friend.statusDescription || ""}>
                    {friend.statusDescription ? <Pencil className="mr-1 size-3.5 shrink-0 opacity-70" /> : null}
                    {friend.statusDescription || "\u00a0"}
                </div>
                <div className="flex min-h-6 min-w-0 items-center justify-center overflow-hidden rounded-md text-center text-zinc-300" style={{ padding: `${7 * scale}px ${8 * scale}px`, fontSize: 12 * scale, lineHeight: 1.3 }} title={locationLabel(friend)}>
                    <span className="line-clamp-2">{locationLabel(friend)}</span>
                </div>
            </div>
        </button>
    );
}

function LoadingCards() {
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,220px))] gap-3.5 p-0.5" aria-label="Loading friends">
            {skeletonIds.map((id) => (
                <div key={id} className="h-28 animate-pulse rounded-md border border-border bg-muted/50" />
            ))}
        </div>
    );
}
