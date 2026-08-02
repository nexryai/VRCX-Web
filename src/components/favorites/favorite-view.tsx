"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ImageIcon, Loader2, RefreshCw, Search, Star, Trash2 } from "lucide-react";

import { FriendAvatar } from "@/components/friends/friend-avatar";
import { useFriends } from "@/components/friends/friends-provider";
import type { VrchatAvatar, VrchatFavorite, VrchatFavoriteGroup, VrchatFavoriteLimits, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";

export type FavoriteKind = "avatar" | "friend" | "world";

type FavoriteGroupView = {
    key: string;
    type: "avatar" | "friend" | "vrcPlusWorld" | "world";
    name: string;
    displayName: string;
    visibility: string;
    capacity: number;
    count: number;
};

const tabs: Array<{ type: FavoriteKind; label: string; href: string; icon: string }> = [
    { type: "friend", label: "Friends", href: "/favorite/friends", icon: "ri-user-star-line" },
    { type: "world", label: "Worlds", href: "/favorite/worlds", icon: "ri-earth-line" },
    { type: "avatar", label: "Avatars", href: "/favorite/avatars", icon: "ri-user-smile-line" },
];

const fallbackLimits = {
    groups: { avatar: 6, friend: 3, vrcPlusWorld: 4, world: 4 },
    capacity: { avatar: 50, friend: 150, vrcPlusWorld: 100, world: 100 },
};

async function fetchFavoritePayload<T>(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { cache: "no-store", signal });
    const payload = (await response.json()) as T & { error?: string };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok) throw new Error(payload.error || "Favorites could not be loaded.");
    return payload;
}

async function fetchAllFavoriteRecords(signal: AbortSignal) {
    const favorites: VrchatFavorite[] = [];
    for (let offset = 0; offset <= 5_000; offset += 100) {
        const payload = await fetchFavoritePayload<{ favorites?: VrchatFavorite[] }>(`/api/favorites?section=records&offset=${offset}`, signal);
        if (!payload.favorites) throw new Error("The favorites response was incomplete.");
        favorites.push(...payload.favorites);
        if (payload.favorites.length < 100) break;
    }
    return favorites;
}

async function fetchAllFavoriteGroups(signal: AbortSignal) {
    const groups: VrchatFavoriteGroup[] = [];
    for (let offset = 0; offset <= 500; offset += 50) {
        const payload = await fetchFavoritePayload<{ groups?: VrchatFavoriteGroup[] }>(`/api/favorites?section=groups&offset=${offset}`, signal);
        if (!payload.groups) throw new Error("The favorite groups response was incomplete.");
        groups.push(...payload.groups);
        if (payload.groups.length < 50) break;
    }
    return groups;
}

function buildGroups(kind: FavoriteKind, records: VrchatFavorite[], remoteGroups: VrchatFavoriteGroup[], limits?: VrchatFavoriteLimits): FavoriteGroupView[] {
    const groupLimits = { ...fallbackLimits.groups, ...limits?.maxFavoriteGroups };
    const capacities = { ...fallbackLimits.capacity, ...limits?.maxFavoritesPerGroup };
    const defaults: FavoriteGroupView[] = [];
    const append = (type: FavoriteGroupView["type"], count: number, name: (index: number) => string, label: (index: number) => string) => {
        for (let index = 0; index < count; index += 1) {
            const groupName = name(index);
            defaults.push({ key: `${type}:${groupName}`, type, name: groupName, displayName: label(index), visibility: "private", capacity: capacities[type], count: 0 });
        }
    };

    if (kind === "friend")
        append(
            "friend",
            groupLimits.friend,
            (index) => `group_${index}`,
            (index) => `Group ${index + 1}`,
        );
    if (kind === "world") {
        append(
            "world",
            groupLimits.world,
            (index) => `worlds${index + 1}`,
            (index) => `Group ${index + 1}`,
        );
        append(
            "vrcPlusWorld",
            groupLimits.vrcPlusWorld,
            (index) => `vrcPlusWorlds${index + 1}`,
            (index) => `VRC+ Group ${index + 1}`,
        );
    }
    if (kind === "avatar")
        append(
            "avatar",
            groupLimits.avatar,
            (index) => `avatars${index + 1}`,
            (index) => `Group ${index + 1}`,
        );

    for (const remote of remoteGroups) {
        const match = defaults.find((group) => group.type === remote.type && group.name === remote.name);
        if (match) {
            match.displayName = remote.displayName || match.displayName;
            match.visibility = remote.visibility || match.visibility;
        }
    }
    for (const favorite of records) {
        const tag = favorite.tags[0];
        const match = defaults.find((group) => group.type === favorite.type && group.name === tag);
        if (match) match.count += 1;
    }
    return defaults;
}

export function FavoriteView({ kind }: { kind: FavoriteKind }) {
    const { allFriends, openUser } = useFriends();
    const [records, setRecords] = useState<VrchatFavorite[]>([]);
    const [remoteGroups, setRemoteGroups] = useState<VrchatFavoriteGroup[]>([]);
    const [limits, setLimits] = useState<VrchatFavoriteLimits>();
    const [items, setItems] = useState<Array<VrchatAvatar | VrchatWorld>>([]);
    const [selectedGroupKey, setSelectedGroupKey] = useState("");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [error, setError] = useState("");
    const [updatingId, setUpdatingId] = useState("");
    const summaryController = useRef<AbortController | null>(null);
    const itemController = useRef<AbortController | null>(null);

    const groups = useMemo(() => buildGroups(kind, records, remoteGroups, limits), [kind, records, remoteGroups, limits]);
    const selectedGroup = groups.find((group) => group.key === selectedGroupKey) || groups.find((group) => group.count > 0) || groups[0];
    const activeGroupKey = selectedGroup?.key;
    const activeGroupName = selectedGroup?.name;

    const loadSummary = useCallback(async () => {
        summaryController.current?.abort();
        const controller = new AbortController();
        summaryController.current = controller;
        setLoading(true);
        setError("");
        try {
            const promises = [fetchAllFavoriteRecords(controller.signal), fetchAllFavoriteGroups(controller.signal), fetchFavoritePayload<{ limits?: VrchatFavoriteLimits }>("/api/favorites?section=limits", controller.signal)] as const;
            const [nextRecords, nextGroups, limitPayload] = await Promise.all(promises);
            setRecords(nextRecords);
            setRemoteGroups(nextGroups);
            setLimits(limitPayload.limits);
        } catch (loadError) {
            if (loadError instanceof DOMException && loadError.name === "AbortError") return;
            setError(loadError instanceof Error ? loadError.message : "Favorites could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSummary();
        return () => summaryController.current?.abort();
    }, [loadSummary]);

    useEffect(() => {
        if (!activeGroupKey || !activeGroupName) return;
        setSelectedGroupKey(activeGroupKey);
        if (kind === "friend") {
            setItems([]);
            return;
        }
        itemController.current?.abort();
        const controller = new AbortController();
        itemController.current = controller;
        setItemsLoading(true);
        setError("");
        void fetchFavoritePayload<{ items?: Array<VrchatAvatar | VrchatWorld> }>(`/api/favorites?section=items&type=${kind}&tag=${encodeURIComponent(activeGroupName)}`, controller.signal)
            .then((payload) => {
                if (!payload.items) throw new Error("The favorite items response was incomplete.");
                setItems(payload.items);
            })
            .catch((loadError) => {
                if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Favorite items could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setItemsLoading(false);
            });
        return () => controller.abort();
    }, [kind, activeGroupKey, activeGroupName]);

    const groupRecords = useMemo(() => records.filter((record) => selectedGroup && record.type === selectedGroup.type && record.tags[0] === selectedGroup.name), [records, selectedGroup]);
    const friendsById = useMemo(() => {
        const byId = new Map(allFriends.map((friend) => [friend.id, friend]));
        return byId;
    }, [allFriends]);
    const visibleItems = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (kind === "friend") {
            return groupRecords
                .map((record) => friendsById.get(record.favoriteId) || ({ id: record.favoriteId, displayName: record.favoriteId } as VrchatUser))
                .filter((friend) => !query || `${friend.displayName} ${friend.id}`.toLocaleLowerCase().includes(query))
                .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
        }
        return items.filter((item) => !query || `${item.name} ${item.authorName || ""} ${item.id}`.toLocaleLowerCase().includes(query)).toSorted((a, b) => a.name.localeCompare(b.name));
    }, [friendsById, groupRecords, items, kind, search]);

    async function removeFavorite(favoriteId: string) {
        setUpdatingId(favoriteId);
        setError("");
        try {
            const response = await fetch(`/api/favorites/${favoriteId}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The favorite could not be removed.");
            setRecords((current) => current.filter((record) => record.favoriteId !== favoriteId));
            setItems((current) => current.filter((item) => item.id !== favoriteId));
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The favorite could not be removed.");
        } finally {
            setUpdatingId("");
        }
    }

    async function moveFavorite(favoriteId: string, destinationKey: string) {
        const destination = groups.find((group) => group.key === destinationKey);
        const currentRecord = records.find((record) => record.favoriteId === favoriteId);
        if (!destination || !currentRecord || destination.key === selectedGroup?.key) return;
        setUpdatingId(favoriteId);
        setError("");
        try {
            const removeResponse = await fetch(`/api/favorites/${favoriteId}`, { method: "DELETE" });
            const removePayload = (await removeResponse.json()) as { error?: string };
            if (!removeResponse.ok) throw new Error(removePayload.error || "The favorite could not be moved.");
            const addResponse = await fetch("/api/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: destination.type, favoriteId, tags: destination.name }),
            });
            const addPayload = (await addResponse.json()) as { error?: string; favorite?: VrchatFavorite };
            if (!addResponse.ok || !addPayload.favorite) throw new Error(addPayload.error || "The favorite could not be added to the selected group.");
            setRecords((current) => current.map((record) => (record.favoriteId === favoriteId ? addPayload.favorite || record : record)));
            setItems((current) => current.filter((item) => item.id !== favoriteId));
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The favorite could not be moved. Refresh to confirm its current group.");
        } finally {
            setUpdatingId("");
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="favorites-heading">
            <div className="border-b border-border px-2 pt-2">
                <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Favorite type">
                    {tabs.map((tab) => (
                        <Link
                            key={tab.type}
                            href={tab.href}
                            role="tab"
                            aria-selected={kind === tab.type}
                            className={`inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium transition ${kind === tab.type ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                            <i className={`${tab.icon} text-base`} aria-hidden="true" />
                            {tab.label}
                        </Link>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <select value={selectedGroup?.key || ""} onChange={(event) => setSelectedGroupKey(event.target.value)} className="h-9 min-w-44 rounded-md border border-input bg-background px-2 text-xs md:hidden" aria-label="Favorite group">
                    {groups.map((group) => (
                        <option key={group.key} value={group.key}>{`${group.displayName} (${group.count}/${group.capacity})`}</option>
                    ))}
                </select>
                <label className="relative min-w-44 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder={`Search favorite ${kind}s`} />
                </label>
                <button type="button" onClick={() => void loadSummary()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh favorites">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1">
                <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-2 md:block" aria-label="VRChat favorite groups">
                    <p className="px-2 py-2 text-xs font-semibold">VRChat Favorites</p>
                    <div className="space-y-2">
                        {groups.map((group) => (
                            <button key={group.key} type="button" onClick={() => setSelectedGroupKey(group.key)} className={`w-full rounded-lg border p-3 text-left hover:bg-muted ${selectedGroup?.key === group.key ? "border-primary/60 bg-muted" : "border-border"}`}>
                                <span className="flex items-start justify-between gap-2 text-xs font-semibold">
                                    <span className="truncate">{group.displayName}</span>
                                    <span className="shrink-0 font-normal">
                                        {group.count}/{group.capacity}
                                    </span>
                                </span>
                                <span className="mt-1 block text-[10px] text-muted-foreground capitalize">{group.visibility}</span>
                            </button>
                        ))}
                    </div>
                </aside>

                <div className="min-w-0 flex-1 overflow-y-auto p-3">
                    <h1 id="favorites-heading" className="sr-only">
                        Favorite {kind}s
                    </h1>
                    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Star aria-hidden="true" className="size-4" />
                        {selectedGroup?.displayName || "Favorites"} · {visibleItems.length} items
                        {loading || itemsLoading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                    </div>
                    {error ? <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
                    {!loading && !itemsLoading && !error && visibleItems.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">This favorite group is empty.</p> : null}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-2">
                        {kind === "friend"
                            ? (visibleItems as VrchatUser[]).map((friend) => <FavoriteFriendCard key={friend.id} friend={friend} groups={groups} selectedGroupKey={selectedGroup?.key || ""} busy={updatingId === friend.id} openUser={openUser} moveFavorite={moveFavorite} removeFavorite={removeFavorite} />)
                            : null}
                        {kind !== "friend"
                            ? (visibleItems as Array<VrchatAvatar | VrchatWorld>).map((item) => <FavoriteContentCard key={item.id} item={item} kind={kind} groups={groups} selectedGroupKey={selectedGroup?.key || ""} busy={updatingId === item.id} moveFavorite={moveFavorite} removeFavorite={removeFavorite} />)
                            : null}
                    </div>
                </div>
            </div>
        </section>
    );
}

type FavoriteActions = {
    groups: FavoriteGroupView[];
    selectedGroupKey: string;
    busy: boolean;
    moveFavorite: (favoriteId: string, destinationKey: string) => Promise<void>;
    removeFavorite: (favoriteId: string) => Promise<void>;
};

function FavoriteControls({ favoriteId, groups, selectedGroupKey, busy, moveFavorite, removeFavorite }: FavoriteActions & { favoriteId: string }) {
    return (
        <span className="flex shrink-0 items-center gap-1">
            <select value={selectedGroupKey} onChange={(event) => void moveFavorite(favoriteId, event.target.value)} disabled={busy} className="h-8 max-w-28 rounded-md border border-input bg-background px-1 text-[10px]" aria-label="Move to favorite group">
                {groups.map((group) => (
                    <option key={group.key} value={group.key}>
                        {group.displayName}
                    </option>
                ))}
            </select>
            <button type="button" onClick={() => void removeFavorite(favoriteId)} disabled={busy} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label="Remove favorite">
                {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
            </button>
        </span>
    );
}

function FavoriteFriendCard({ friend, openUser, ...actions }: FavoriteActions & { friend: VrchatUser; openUser: (userId: string) => void }) {
    return (
        <article className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2 hover:bg-muted">
            <button type="button" onClick={() => openUser(friend.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FriendAvatar friend={friend} size="sm" />
                <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{friend.displayName}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{friend.statusDescription || friend.status || "Offline"}</span>
                </span>
            </button>
            <FavoriteControls favoriteId={friend.id} {...actions} />
        </article>
    );
}

function FavoriteContentCard({ item, kind, ...actions }: FavoriteActions & { item: VrchatAvatar | VrchatWorld; kind: Exclude<FavoriteKind, "friend"> }) {
    return (
        <article className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-2 hover:bg-muted">
            <a href={`https://vrchat.com/home/${kind}/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    {item.thumbnailImageUrl ? <img src={item.thumbnailImageUrl.replace("256", "128")} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon aria-hidden="true" className="size-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{item.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{item.authorName ? `by ${item.authorName}` : item.id}</span>
                </span>
            </a>
            <FavoriteControls favoriteId={item.id} {...actions} />
        </article>
    );
}
