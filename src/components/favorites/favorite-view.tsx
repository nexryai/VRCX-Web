"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Download, Ellipsis, ImageIcon, Loader2, Pencil, Plus, RefreshCcw, RefreshCw, Search, Trash2, Upload, User, X } from "lucide-react";

import { FriendAvatar } from "@/components/friends/friend-avatar";
import { useFriends } from "@/components/friends/friends-provider";
import { VrchatImage } from "@/components/vrchat-image";
import { FAVORITE_TRANSFER_MAX_FILE_BYTES, formatFavoriteCsv, isVrcxCsvExport, parseFavoriteIds } from "@/lib/favorites-transfer";
import { locationLabel } from "@/lib/friends";
import type { VrchatAvatar, VrchatFavorite, VrchatFavoriteGroup, VrchatFavoriteLimits, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";

export type FavoriteKind = "avatar" | "friend" | "world";
type FavoriteItem = VrchatAvatar | VrchatUser | VrchatWorld;
type RemoteGroupType = "avatar" | "friend" | "vrcPlusWorld" | "world";

type FavoriteGroupView = {
    key: string;
    type: RemoteGroupType;
    name: string;
    displayName: string;
    visibility: string;
    capacity: number;
    count: number;
};

type LocalGroup = {
    groupId: string;
    kind: FavoriteKind;
    name: string;
    count: number;
};

type LocalItem = {
    groupId: string;
    objectId: string;
    item: FavoriteItem;
    createdAt: string;
    updatedAt: string;
};

type DisplayEntry = {
    key: string;
    source: "local" | "remote";
    objectId: string;
    item: FavoriteItem;
    groupId?: string;
    remoteGroupKey?: string;
    order: number;
};

const fallbackLimits = {
    groups: { avatar: 6, friend: 3, vrcPlusWorld: 4, world: 4 },
    capacity: { avatar: 50, friend: 150, vrcPlusWorld: 100, world: 100 },
};

async function payload<T>(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { cache: "no-store", signal });
    const body = (await response.json()) as T & { error?: string };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok) throw new Error(body.error || "Favorites could not be loaded.");
    return body;
}

async function allRecords(signal: AbortSignal) {
    const favorites: VrchatFavorite[] = [];
    for (let offset = 0; offset <= 5_000; offset += 100) {
        const result = await payload<{ favorites?: VrchatFavorite[] }>(`/api/favorites?section=records&offset=${offset}`, signal);
        if (!result.favorites) throw new Error("The favorites response was incomplete.");
        favorites.push(...result.favorites);
        if (result.favorites.length < 100) break;
    }
    return favorites;
}

async function allGroups(signal: AbortSignal) {
    const groups: VrchatFavoriteGroup[] = [];
    for (let offset = 0; offset <= 500; offset += 50) {
        const result = await payload<{ groups?: VrchatFavoriteGroup[] }>(`/api/favorites?section=groups&offset=${offset}`, signal);
        if (!result.groups) throw new Error("The favorite groups response was incomplete.");
        groups.push(...result.groups);
        if (result.groups.length < 50) break;
    }
    return groups;
}

function buildGroups(kind: FavoriteKind, records: VrchatFavorite[], remoteGroups: VrchatFavoriteGroup[], limits?: VrchatFavoriteLimits) {
    const groupLimits = { ...fallbackLimits.groups, ...limits?.maxFavoriteGroups };
    const capacities = { ...fallbackLimits.capacity, ...limits?.maxFavoritesPerGroup };
    const groups: FavoriteGroupView[] = [];
    const append = (type: RemoteGroupType, count: number, name: (index: number) => string, label: (index: number) => string) => {
        for (let index = 0; index < count; index += 1) {
            const groupName = name(index);
            groups.push({ key: `${type}:${groupName}`, type, name: groupName, displayName: label(index), visibility: "private", capacity: capacities[type], count: 0 });
        }
    };
    if (kind === "friend")
        append(
            "friend",
            groupLimits.friend,
            (index) => `group_${index}`,
            (index) => `Group ${index + 1}`,
        );
    if (kind === "avatar")
        append(
            "avatar",
            groupLimits.avatar,
            (index) => `avatars${index + 1}`,
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
    for (const remote of remoteGroups) {
        const match = groups.find((group) => group.type === remote.type && group.name === remote.name);
        if (match) {
            match.displayName = remote.displayName || match.displayName;
            match.visibility = remote.visibility || match.visibility;
        }
    }
    for (const favorite of records) {
        const match = groups.find((group) => group.type === favorite.type && group.name === favorite.tags[0]);
        if (match) match.count += 1;
    }
    return groups;
}

function itemName(item: FavoriteItem): string {
    return item.id.startsWith("usr_") ? (item as VrchatUser).displayName : (item as VrchatAvatar | VrchatWorld).name;
}

function itemSearchDetail(item: FavoriteItem): string {
    return item.id.startsWith("usr_") ? (item as VrchatUser).bio || "" : (item as VrchatAvatar | VrchatWorld).authorName || "";
}

function objectKindMatches(kind: FavoriteKind, record: VrchatFavorite) {
    return kind === "world" ? record.type === "world" || record.type === "vrcPlusWorld" : record.type === kind;
}

export function FavoriteView({ kind }: { kind: FavoriteKind }) {
    const { allFriends, openUser, openWorld, openAvatar } = useFriends();
    const [records, setRecords] = useState<VrchatFavorite[]>([]);
    const [remoteGroups, setRemoteGroups] = useState<VrchatFavoriteGroup[]>([]);
    const [limits, setLimits] = useState<VrchatFavoriteLimits>();
    const [remoteItems, setRemoteItems] = useState<Array<VrchatAvatar | VrchatWorld>>([]);
    const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
    const [localItems, setLocalItems] = useState<Record<string, LocalItem[]>>({});
    const [selection, setSelection] = useState("");
    const [search, setSearch] = useState("");
    const [sortByDate, setSortByDate] = useState(false);
    const [cardScales, setCardScales] = useState<Record<FavoriteKind, number>>({ avatar: 1, friend: 1, world: 1 });
    const [cardSpacings, setCardSpacings] = useState<Record<FavoriteKind, number>>({ avatar: 1, friend: 1, world: 1 });
    const [scale, setScale] = useState(1);
    const [spacing, setSpacing] = useState(1);
    const [editMode, setEditMode] = useState(false);
    const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
    const [copyDestination, setCopyDestination] = useState("");
    const [creatingLocal, setCreatingLocal] = useState(false);
    const [newLocalName, setNewLocalName] = useState("");
    const [editingRemote, setEditingRemote] = useState<FavoriteGroupView | null>(null);
    const [editingLocal, setEditingLocal] = useState<LocalGroup | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);
    const toolbarMenuRef = useRef<HTMLDetailsElement | null>(null);

    const remoteGroupViews = useMemo(() => buildGroups(kind, records, remoteGroups, limits), [kind, limits, records, remoteGroups]);

    const load = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        setError("");
        try {
            const [nextRecords, nextRemoteGroups, limitResult, localResult, settings, itemResult] = await Promise.all([
                allRecords(controller.signal),
                allGroups(controller.signal),
                payload<{ limits?: VrchatFavoriteLimits }>("/api/favorites?section=limits", controller.signal),
                payload<{ groups?: LocalGroup[] }>(`/api/local-favorites?kind=${kind}`, controller.signal),
                payload<{ favoriteSortByDate?: boolean; favoriteCardScale?: Record<FavoriteKind, number>; favoriteCardSpacing?: Record<FavoriteKind, number> }>("/api/settings", controller.signal),
                kind === "friend" ? Promise.resolve({ items: [] }) : payload<{ items?: Array<VrchatAvatar | VrchatWorld> }>(`/api/favorites?section=items&type=${kind}`, controller.signal),
            ]);
            const nextLocalGroups = localResult.groups || [];
            const localResults = await Promise.all(nextLocalGroups.map((group) => payload<{ items?: LocalItem[] }>(`/api/local-favorites?kind=${kind}&groupId=${group.groupId}`, controller.signal)));
            setRecords(nextRecords);
            setRemoteGroups(nextRemoteGroups);
            setLimits(limitResult.limits);
            setRemoteItems(itemResult.items || []);
            setLocalGroups(nextLocalGroups);
            setLocalItems(Object.fromEntries(nextLocalGroups.map((group, index) => [group.groupId, localResults[index].items || []])));
            setSortByDate(settings.favoriteSortByDate || false);
            const nextScales = settings.favoriteCardScale || { avatar: 1, friend: 1, world: 1 };
            const nextSpacings = settings.favoriteCardSpacing || { avatar: 1, friend: 1, world: 1 };
            setCardScales(nextScales);
            setCardSpacings(nextSpacings);
            setScale(nextScales[kind]);
            setSpacing(nextSpacings[kind]);
        } catch (loadError) {
            if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Favorites could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        void load();
        return () => controllerRef.current?.abort();
    }, [load]);

    const validSelections = useMemo(() => [...remoteGroupViews.map((group) => `remote:${group.key}`), ...localGroups.map((group) => `local:${group.groupId}`)], [localGroups, remoteGroupViews]);
    useEffect(() => {
        if (selection && validSelections.includes(selection)) return;
        const firstRemote = remoteGroupViews.find((group) => group.count > 0) || remoteGroupViews[0];
        setSelection(firstRemote ? `remote:${firstRemote.key}` : localGroups[0] ? `local:${localGroups[0].groupId}` : "");
        setSelectedEntries(new Set());
    }, [localGroups, remoteGroupViews, selection, validSelections]);

    const selectedRemote = selection.startsWith("remote:") ? remoteGroupViews.find((group) => group.key === selection.slice(7)) : undefined;
    const selectedLocal = selection.startsWith("local:") ? localGroups.find((group) => group.groupId === selection.slice(6)) : undefined;
    const friendsById = useMemo(() => new Map(allFriends.map((friend) => [friend.id, friend])), [allFriends]);
    const remoteById = useMemo(() => new Map(remoteItems.map((item) => [item.id, item])), [remoteItems]);

    const allEntries = useMemo(() => {
        const result: DisplayEntry[] = [];
        const remoteRecords = records.filter((record) => objectKindMatches(kind, record));
        for (const [index, record] of remoteRecords.entries()) {
            const group = remoteGroupViews.find((candidate) => candidate.type === record.type && candidate.name === record.tags[0]);
            if (!group) continue;
            const item = kind === "friend" ? friendsById.get(record.favoriteId) || ({ id: record.favoriteId, displayName: record.favoriteId } as VrchatUser) : remoteById.get(record.favoriteId) || ({ id: record.favoriteId, name: record.favoriteId } as VrchatAvatar);
            result.push({ key: `remote:${group.key}:${record.favoriteId}`, source: "remote", objectId: record.favoriteId, item, remoteGroupKey: group.key, order: index });
        }
        for (const group of localGroups) {
            for (const [index, favorite] of (localItems[group.groupId] || []).entries()) result.push({ key: `local:${group.groupId}:${favorite.objectId}`, source: "local", objectId: favorite.objectId, item: favorite.item, groupId: group.groupId, order: index });
        }
        return result;
    }, [friendsById, kind, localGroups, localItems, records, remoteById, remoteGroupViews]);

    const entries = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return allEntries
            .filter((entry) => (query ? `${itemName(entry.item)} ${itemSearchDetail(entry.item)} ${entry.objectId}`.toLocaleLowerCase().includes(query) : selectedRemote ? entry.remoteGroupKey === selectedRemote.key : selectedLocal ? entry.groupId === selectedLocal.groupId : false))
            .toSorted((left, right) => (sortByDate ? left.order - right.order : itemName(left.item).localeCompare(itemName(right.item))));
    }, [allEntries, search, selectedLocal, selectedRemote, sortByDate]);

    const activeTitle = search ? "Search" : selectedRemote ? selectedRemote.displayName : selectedLocal ? selectedLocal.name : "No Group Selected";
    const activeCount = search ? entries.length : selectedRemote ? `${selectedRemote.count}/${selectedRemote.capacity}` : selectedLocal?.count || 0;

    function saveLayout(next: { sort?: boolean; scale?: number; spacing?: number }) {
        const nextScale = next.scale ?? scale;
        const nextSpacing = next.spacing ?? spacing;
        void fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...(next.sort === undefined ? {} : { favoriteSortByDate: next.sort }),
                ...(next.scale === undefined ? {} : { favoriteCardScale: { ...cardScales, [kind]: nextScale } }),
                ...(next.spacing === undefined ? {} : { favoriteCardSpacing: { ...cardSpacings, [kind]: nextSpacing } }),
            }),
        });
    }

    async function createLocalGroup() {
        const name = newLocalName.trim();
        if (!name) return;
        await mutateLocal({ method: "POST", body: { action: "create-group", kind, name } });
        setCreatingLocal(false);
        setNewLocalName("");
    }

    async function mutateLocal({ method, body }: { method: "DELETE" | "PATCH" | "POST"; body: object }) {
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/local-favorites", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(result.error || "Local favorites could not be updated.");
            await load();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Local favorites could not be updated.");
        } finally {
            setBusy(false);
        }
    }

    async function removeRemote(objectId: string) {
        setBusy(true);
        const response = await fetch(`/api/favorites/${objectId}`, { method: "DELETE" });
        if (response.ok) setRecords((current) => current.filter((record) => record.favoriteId !== objectId));
        else setError("The favorite could not be removed.");
        setBusy(false);
    }

    async function moveRemote(objectId: string, destinationKey: string) {
        const destination = remoteGroupViews.find((group) => group.key === destinationKey);
        if (!destination || destination.key === selectedRemote?.key || destination.count >= destination.capacity) return;
        setBusy(true);
        try {
            const remove = await fetch(`/api/favorites/${objectId}`, { method: "DELETE" });
            if (!remove.ok) throw new Error("The favorite could not be moved.");
            const add = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: destination.type, favoriteId: objectId, tags: destination.name }) });
            if (!add.ok) throw new Error("The favorite could not be added to the destination group.");
            await load();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The favorite could not be moved.");
        } finally {
            setBusy(false);
        }
    }

    async function bulkRemove() {
        const selected = entries.filter((entry) => selectedEntries.has(entry.key));
        if (!selected.length || !window.confirm(`Remove ${selected.length} selected favorite${selected.length === 1 ? "" : "s"}?`)) return;
        for (const entry of selected) {
            if (entry.source === "remote") await removeRemote(entry.objectId);
            else if (entry.groupId) await mutateLocal({ method: "DELETE", body: { action: "item", groupId: entry.groupId, objectId: entry.objectId } });
        }
        setSelectedEntries(new Set());
    }

    async function copySelected() {
        if (!copyDestination) return;
        for (const entry of entries.filter((candidate) => selectedEntries.has(candidate.key) && candidate.source === "remote")) await mutateLocal({ method: "POST", body: { action: "add", kind, groupId: copyDestination, objectId: entry.objectId } });
        setSelectedEntries(new Set());
    }

    const gridStyle = { gridTemplateColumns: `repeat(auto-fill,minmax(min(100%,${Math.round(220 * scale)}px),1fr))`, gap: `${Math.max(4, Math.round(12 * spacing))}px` };

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden p-2" aria-labelledby="favorites-heading">
            <h1 id="favorites-heading" className="sr-only">
                Favorite {kind}s
            </h1>
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
                <select
                    value={sortByDate ? "date" : "name"}
                    onChange={(event) => {
                        const value = event.target.value === "date";
                        setSortByDate(value);
                        saveLayout({ sort: value });
                    }}
                    className="h-9 min-w-50 rounded-md border border-input bg-background px-3 text-xs"
                    aria-label="Sort favorites"
                >
                    <option value="name">Sort favorites by name</option>
                    <option value="date">Sort favorites by date</option>
                </select>
                <div className="flex min-w-52 flex-1 items-center gap-2">
                    <label className="relative min-w-0 flex-1">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-xs" placeholder={`Search favorite ${kind}s`} />
                    </label>
                    <details ref={toolbarMenuRef} className="relative">
                        <summary className="inline-flex size-8 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Favorite card settings">
                            <Ellipsis className="size-4" />
                        </summary>
                        <div className="absolute top-9 right-0 z-30 w-60 rounded-md border border-border bg-popover p-4 shadow-xl">
                            <label className="block text-xs font-semibold">
                                <span className="flex justify-between">
                                    Scale <span>{Math.round(scale * 100)}%</span>
                                </span>
                                <input
                                    type="range"
                                    min="0.6"
                                    max="1"
                                    step="0.01"
                                    value={scale}
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        setScale(value);
                                        setCardScales((current) => ({ ...current, [kind]: value }));
                                        saveLayout({ scale: value });
                                    }}
                                    className="mt-2 w-full accent-primary"
                                />
                            </label>
                            <label className="mt-4 block text-xs font-semibold">
                                <span className="flex justify-between">
                                    Spacing <span>{Math.round(spacing * 100)}%</span>
                                </span>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="1.5"
                                    step="0.05"
                                    value={spacing}
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        setSpacing(value);
                                        setCardSpacings((current) => ({ ...current, [kind]: value }));
                                        saveLayout({ spacing: value });
                                    }}
                                    className="mt-2 w-full accent-primary"
                                />
                            </label>
                            <div className="my-3 border-t border-border" />
                            <button
                                type="button"
                                onClick={() => {
                                    if (toolbarMenuRef.current) toolbarMenuRef.current.open = false;
                                    setImportOpen(true);
                                }}
                                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted"
                            >
                                <Upload className="size-4" /> Import
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (toolbarMenuRef.current) toolbarMenuRef.current.open = false;
                                    setExportOpen(true);
                                }}
                                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted"
                            >
                                <Download className="size-4" /> Export
                            </button>
                        </div>
                    </details>
                </div>
            </div>

            <div className="mb-2 flex gap-2 md:hidden">
                <select value={selection} onChange={(event) => setSelection(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" aria-label="Favorite group">
                    <optgroup label="VRChat Favorites">
                        {remoteGroupViews.map((group) => (
                            <option key={group.key} value={`remote:${group.key}`}>{`${group.displayName} (${group.count}/${group.capacity})`}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Local Favorites">
                        {localGroups.map((group) => (
                            <option key={group.groupId} value={`local:${group.groupId}`}>{`${group.name} (${group.count})`}</option>
                        ))}
                    </optgroup>
                </select>
                <button
                    type="button"
                    onClick={() => {
                        if (selectedRemote) setEditingRemote(selectedRemote);
                        else if (selectedLocal) setEditingLocal(selectedLocal);
                    }}
                    disabled={!selectedRemote && !selectedLocal}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input disabled:opacity-40"
                    aria-label="Manage selected favorite group"
                >
                    <Ellipsis className="size-4" />
                </button>
                <button type="button" onClick={() => setCreatingLocal(true)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input" aria-label="Create local favorite group">
                    <Plus className="size-4" />
                </button>
            </div>
            {creatingLocal ? (
                <input
                    autoFocus
                    value={newLocalName}
                    onChange={(event) => setNewLocalName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") void createLocalGroup();
                        if (event.key === "Escape") setCreatingLocal(false);
                    }}
                    onBlur={() => {
                        if (!newLocalName.trim()) setCreatingLocal(false);
                    }}
                    className="mb-2 h-9 w-full rounded-md border border-input bg-background px-2 text-xs md:hidden"
                    placeholder="New local group"
                    maxLength={64}
                />
            ) : null}

            {error ? <p className="mb-2 shrink-0 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
            <div className="flex min-h-0 flex-1">
                <aside className="hidden w-56 shrink-0 overflow-y-auto pr-2 md:flex md:flex-col md:gap-3" aria-label="Favorite groups">
                    <GroupSection title="VRChat Favorites" refresh={() => void load()} loading={loading}>
                        {remoteGroupViews.map((group) => (
                            <GroupCard key={group.key} name={group.displayName} count={`${group.count}/${group.capacity}`} visibility={group.visibility} active={!search && selectedRemote?.key === group.key} select={() => setSelection(`remote:${group.key}`)} manage={() => setEditingRemote(group)} />
                        ))}
                    </GroupSection>
                    <GroupSection title="Local Favorites" refresh={() => void load()}>
                        {localGroups.map((group) => (
                            <GroupCard key={group.groupId} name={group.name} count={String(group.count)} active={!search && selectedLocal?.groupId === group.groupId} select={() => setSelection(`local:${group.groupId}`)} manage={() => setEditingLocal(group)} />
                        ))}
                        {creatingLocal ? (
                            <input
                                autoFocus
                                value={newLocalName}
                                onChange={(event) => setNewLocalName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") void createLocalGroup();
                                    if (event.key === "Escape") setCreatingLocal(false);
                                }}
                                onBlur={() => {
                                    if (!newLocalName.trim()) setCreatingLocal(false);
                                }}
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                                placeholder="New group"
                                maxLength={64}
                            />
                        ) : (
                            <button type="button" onClick={() => setCreatingLocal(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs hover:bg-muted">
                                <Plus className="size-4" /> New group
                            </button>
                        )}
                    </GroupSection>
                </aside>
                <div className="hidden w-px shrink-0 bg-border md:block" />
                <main className="flex min-w-0 flex-1 flex-col pl-0 md:pl-[26px]">
                    <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                        <div className="text-base font-semibold">
                            {activeTitle} <small className="text-xs font-normal">{activeCount}</small>
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                            Edit mode
                            <input type="checkbox" checked={editMode} onChange={(event) => setEditMode(event.target.checked)} disabled={Boolean(search) || !selection} className="accent-primary" />
                        </label>
                    </div>
                    {editMode && !search ? (
                        <div className="mb-3 flex shrink-0 flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => setSelectedEntries(selectedEntries.size === entries.length ? new Set() : new Set(entries.map((entry) => entry.key)))} className="h-8 rounded-md border border-input px-3 text-xs">
                                {selectedEntries.size === entries.length && entries.length ? "Deselect all" : "Select all"}
                            </button>
                            <button type="button" onClick={() => setSelectedEntries(new Set())} disabled={!selectedEntries.size} className="h-8 rounded-md bg-secondary px-3 text-xs disabled:opacity-40">
                                Clear
                            </button>
                            {selectedRemote && localGroups.length ? (
                                <>
                                    <select value={copyDestination} onChange={(event) => setCopyDestination(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Copy to local group">
                                        <option value="">Local group</option>
                                        {localGroups.map((group) => (
                                            <option key={group.groupId} value={group.groupId}>
                                                {group.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="button" onClick={() => void copySelected()} disabled={!selectedEntries.size || !copyDestination} className="h-8 rounded-md border border-input px-3 text-xs disabled:opacity-40">
                                        Copy
                                    </button>
                                </>
                            ) : null}
                            <button type="button" onClick={() => void bulkRemove()} disabled={!selectedEntries.size} className="h-8 rounded-md border border-input px-3 text-xs disabled:opacity-40">
                                Bulk unfavorite
                            </button>
                        </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                        {loading ? (
                            <div className="flex h-full min-h-64 items-center justify-center">
                                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : null}
                        {!loading && !entries.length ? <div className="flex h-full min-h-64 items-center justify-center text-xs text-muted-foreground">No data</div> : null}
                        {!loading && entries.length ? (
                            <div className="grid pb-3" style={gridStyle}>
                                {entries.map((entry) => (
                                    <FavoriteCard
                                        key={entry.key}
                                        entry={entry}
                                        kind={kind}
                                        editMode={editMode && !search}
                                        selected={selectedEntries.has(entry.key)}
                                        toggle={() =>
                                            setSelectedEntries((current) => {
                                                const next = new Set(current);
                                                if (next.has(entry.key)) next.delete(entry.key);
                                                else next.add(entry.key);
                                                return next;
                                            })
                                        }
                                        openUser={openUser}
                                        openWorld={openWorld}
                                        openAvatar={openAvatar}
                                        remoteGroups={remoteGroupViews}
                                        busy={busy}
                                        moveRemote={moveRemote}
                                        removeRemote={removeRemote}
                                        removeLocal={(groupId, objectId) => mutateLocal({ method: "DELETE", body: { action: "item", groupId, objectId } })}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </main>
            </div>
            {editingRemote ? <RemoteGroupDialog group={editingRemote} close={() => setEditingRemote(null)} saved={(group) => setRemoteGroups((current) => [...current.filter((item) => !(item.type === group.type && item.name === group.name)), group])} cleared={() => void load()} /> : null}
            {editingLocal ? <LocalGroupDialog group={editingLocal} close={() => setEditingLocal(null)} rename={(name) => mutateLocal({ method: "PATCH", body: { groupId: editingLocal.groupId, name } })} remove={() => mutateLocal({ method: "DELETE", body: { action: "group", groupId: editingLocal.groupId } })} /> : null}
            {importOpen ? <FavoriteImportDialog kind={kind} remoteGroups={remoteGroupViews} localGroups={localGroups} close={() => setImportOpen(false)} complete={load} /> : null}
            {exportOpen ? <FavoriteExportDialog kind={kind} currentEntries={entries} allEntries={allEntries} remoteGroups={remoteGroupViews} localGroups={localGroups} close={() => setExportOpen(false)} /> : null}
        </section>
    );
}

function GroupSection({ title, refresh, loading = false, children }: { title: string; refresh: () => void; loading?: boolean; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <header className="mb-[9px] flex items-center justify-between text-sm font-semibold">
                {title}
                <button type="button" onClick={refresh} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={`Refresh ${title}`}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : title.startsWith("VRChat") ? <RefreshCw className="size-4" /> : <RefreshCcw className="size-4" />}
                </button>
            </header>
            {children}
        </section>
    );
}

function GroupCard({ name, count, visibility, active, select, manage }: { name: string; count: string; visibility?: string; active: boolean; select: () => void; manage: () => void }) {
    const visibilityBorder = visibility === "public" ? "border-l-green-500" : visibility === "friends" ? "border-l-blue-500" : visibility ? "border-l-slate-500" : "";
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={select}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") select();
            }}
            className={`min-h-16 cursor-pointer rounded-lg border border-border p-2 text-left hover:bg-muted hover:shadow-sm ${visibility ? `border-l-[3px] ${visibilityBorder}` : ""} ${active ? "bg-muted ring-1 ring-primary/50" : ""}`}
        >
            <span className="mb-1 flex items-start justify-between gap-2 text-[13px] font-semibold">
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-xs font-normal">{count}</span>
            </span>
            <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="capitalize">{visibility || "Local"}</span>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        manage();
                    }}
                    className="inline-flex size-6 items-center justify-center rounded-full hover:bg-background"
                    aria-label={`Manage ${name}`}
                >
                    <Ellipsis className="size-4" />
                </button>
            </span>
        </div>
    );
}

function FavoriteCard({
    entry,
    kind,
    editMode,
    selected,
    toggle,
    openUser,
    openWorld,
    openAvatar,
    remoteGroups,
    busy,
    moveRemote,
    removeRemote,
    removeLocal,
}: {
    entry: DisplayEntry;
    kind: FavoriteKind;
    editMode: boolean;
    selected: boolean;
    toggle: () => void;
    openUser: (id: string) => void;
    openWorld: (id: string) => void;
    openAvatar: (id: string) => void;
    remoteGroups: FavoriteGroupView[];
    busy: boolean;
    moveRemote: (id: string, group: string) => Promise<void>;
    removeRemote: (id: string) => Promise<void>;
    removeLocal: (groupId: string, id: string) => Promise<void>;
}) {
    const user = kind === "friend" ? (entry.item as VrchatUser) : null;
    const remoteItem = kind === "friend" ? null : (entry.item as VrchatAvatar | VrchatWorld);
    const world = kind === "world" ? (entry.item as VrchatWorld) : null;
    const content = kind === "friend" ? user?.statusDescription || (user ? locationLabel(user) : "") : `${remoteItem?.authorName || ""}${world?.occupants ? ` (${world.occupants})` : ""}`;
    const image = remoteItem?.thumbnailImageUrl || "";
    const open = () => {
        if (kind === "friend") openUser(entry.objectId);
        else if (kind === "world") openWorld(entry.objectId);
        else openAvatar(entry.objectId);
    };
    return (
        <article className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-2 hover:bg-muted" onClick={open}>
            {user ? (
                <FriendAvatar friend={user} size="sm" />
            ) : (
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    <VrchatImage
                        src={image.replace("256", "128")}
                        alt=""
                        className="size-full object-cover [filter:saturate(.8)_contrast(.8)]"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        fallback={kind === "avatar" ? <User className="size-4 text-muted-foreground" /> : <ImageIcon className="size-4 text-muted-foreground" />}
                    />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{itemName(entry.item)}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{content}</span>
            </span>
            {editMode ? <input type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={toggle} className="accent-primary" aria-label={`Select ${itemName(entry.item)}`} /> : null}
            {!editMode ? (
                <details className="relative" onClick={(event) => event.stopPropagation()}>
                    <summary className="inline-flex size-7 cursor-pointer list-none items-center justify-center rounded-full hover:bg-background [&::-webkit-details-marker]:hidden" aria-label={`Manage ${itemName(entry.item)}`}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
                    </summary>
                    <div className="absolute top-8 right-0 z-20 w-48 rounded-md border border-border bg-popover p-1 text-xs shadow-xl">
                        <button type="button" onClick={open} className="w-full rounded px-2 py-2 text-left hover:bg-muted">
                            View details
                        </button>
                        {entry.source === "remote" ? (
                            <label className="block px-2 py-1 text-[10px] text-muted-foreground">
                                Move to
                                <select defaultValue={entry.remoteGroupKey} onChange={(event) => void moveRemote(entry.objectId, event.target.value)} className="mt-1 h-8 w-full rounded border border-input bg-background px-1 text-xs">
                                    {remoteGroups.map((group) => (
                                        <option key={group.key} value={group.key} disabled={group.count >= group.capacity}>
                                            {group.displayName} ({group.count}/{group.capacity})
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                        <button type="button" onClick={() => (entry.source === "remote" ? void removeRemote(entry.objectId) : entry.groupId ? void removeLocal(entry.groupId, entry.objectId) : undefined)} className="w-full rounded px-2 py-2 text-left text-destructive hover:bg-destructive/10">
                            {entry.source === "remote" ? "Unfavorite" : "Delete"}
                        </button>
                    </div>
                </details>
            ) : null}
        </article>
    );
}

type ImportCandidate = { id: string; item?: FavoriteItem; error?: string };
type ExportField = "Group" | "ID" | "Name" | "Source" | "Status/Author";

function FavoriteImportDialog({ kind, remoteGroups, localGroups, close, complete }: { kind: FavoriteKind; remoteGroups: FavoriteGroupView[]; localGroups: LocalGroup[]; close: () => void; complete: () => Promise<void> }) {
    const [input, setInput] = useState("");
    const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
    const [destination, setDestination] = useState("");
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    const controllerRef = useRef<AbortController | null>(null);

    function parsedIds() {
        return parseFavoriteIds(kind, input);
    }

    async function processList() {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        const ids = parsedIds();
        setCandidates([]);
        setProgress(0);
        setResult("");
        setProcessing(true);
        const next: ImportCandidate[] = [];
        for (const [index, id] of ids.entries()) {
            try {
                next.push({ id, item: await resolveFavoriteItem(kind, id, controller.signal) });
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") break;
                next.push({ id, error: error instanceof Error ? error.message : "The item could not be loaded." });
            }
            setCandidates([...next]);
            setProgress(index + 1);
        }
        setProcessing(false);
    }

    async function importItems() {
        const valid = candidates.filter((candidate) => candidate.item);
        if (!destination || !valid.length) return;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setProcessing(true);
        setProgress(0);
        setResult("");
        const failures: string[] = [];
        for (const [index, candidate] of valid.entries()) {
            try {
                const remote = destination.startsWith("remote:") ? remoteGroups.find((group) => group.key === destination.slice(7)) : undefined;
                const localId = destination.startsWith("local:") ? destination.slice(6) : undefined;
                const response = remote
                    ? await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: remote.type, favoriteId: candidate.id, tags: remote.name }), signal: controller.signal })
                    : await fetch("/api/local-favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", kind, groupId: localId, objectId: candidate.id }), signal: controller.signal });
                const body = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(body.error || "The favorite could not be imported.");
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") break;
                failures.push(`${candidate.id}: ${error instanceof Error ? error.message : "Import failed."}`);
            }
            setProgress(index + 1);
        }
        await complete();
        setProcessing(false);
        setResult(failures.length ? failures.join("\n") : `${valid.length} favorite${valid.length === 1 ? "" : "s"} imported.`);
    }

    const ids = parsedIds();
    const validCount = candidates.filter((candidate) => candidate.item).length;
    const vrcxCsv = isVrcxCsvExport(kind, input);
    return (
        <DialogFrame
            title={`Import favorite ${kind}s`}
            close={() => {
                controllerRef.current?.abort();
                close();
            }}
            wide
        >
            <p className="mt-3 text-xs text-muted-foreground">Paste a list containing VRChat {kind} IDs, or load a VRCX-compatible text/CSV export. The server validates each item through the allowlisted VRChat API before it can enter a local group.</p>
            <textarea
                value={input}
                onChange={(event) => {
                    setInput(event.target.value);
                    setCandidates([]);
                    setResult("");
                }}
                rows={6}
                maxLength={FAVORITE_TRANSFER_MAX_FILE_BYTES}
                className="mt-3 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs"
                placeholder={`${kind === "avatar" ? "avtr" : kind === "friend" ? "usr" : "wrld"}_...`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                    ref={fileInput}
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        event.currentTarget.value = "";
                        if (file.size > FAVORITE_TRANSFER_MAX_FILE_BYTES) {
                            setInput("");
                            setCandidates([]);
                            setResult("Import failed: The file is larger than 1 MB.");
                            return;
                        }
                        void file
                            .text()
                            .then((value) => {
                                setInput(value);
                                setCandidates([]);
                                setResult("");
                            })
                            .catch(() => setResult("Import failed: The file could not be read."));
                    }}
                />
                <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs">
                    <Upload className="size-4" /> Open file
                </button>
                {processing ? (
                    <button type="button" onClick={() => controllerRef.current?.abort()} className="h-8 rounded-md bg-secondary px-3 text-xs">
                        Cancel
                    </button>
                ) : (
                    <button type="button" onClick={() => void processList()} disabled={!ids.length} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                        Process list
                    </button>
                )}
                {processing ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {progress} / {candidates.length ? Math.max(candidates.length, ids.length) : ids.length}
                    </span>
                ) : null}
                {ids.length ? (
                    <span className="text-xs text-muted-foreground">
                        {vrcxCsv ? "VRCX CSV detected · " : ""}
                        {ids.length} unique {kind} {ids.length === 1 ? "ID" : "IDs"}
                    </span>
                ) : null}
            </div>
            {candidates.length ? (
                <div className="mt-4 max-h-52 overflow-auto rounded-md border border-border">
                    <table className="w-full min-w-[520px] text-left text-xs">
                        <thead className="sticky top-0 bg-muted">
                            <tr>
                                <th className="px-2 py-1.5">ID</th>
                                <th className="px-2 py-1.5">Name</th>
                                <th className="px-2 py-1.5">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {candidates.map((candidate) => (
                                <tr key={candidate.id} className="border-t border-border">
                                    <td className="px-2 py-1.5 font-mono text-[10px]">{candidate.id}</td>
                                    <td className="px-2 py-1.5">{candidate.item ? itemName(candidate.item) : "—"}</td>
                                    <td className={`px-2 py-1.5 ${candidate.error ? "text-destructive" : "text-emerald-400"}`}>{candidate.error || "Ready"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
            {candidates.length ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select value={destination} onChange={(event) => setDestination(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" aria-label="Import destination">
                        <option value="">Select destination group</option>
                        <optgroup label="VRChat Favorites">
                            {remoteGroups.map((group) => (
                                <option key={group.key} value={`remote:${group.key}`} disabled={group.count >= group.capacity}>
                                    {group.displayName} ({group.count}/{group.capacity})
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Local Favorites">
                            {localGroups.map((group) => (
                                <option key={group.groupId} value={`local:${group.groupId}`}>
                                    {group.name} ({group.count})
                                </option>
                            ))}
                        </optgroup>
                    </select>
                    <button type="button" onClick={() => void importItems()} disabled={processing || !destination || !validCount} className="h-9 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                        Import {validCount}
                    </button>
                </div>
            ) : null}
            {result ? <pre className={`mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-md p-2 text-xs ${result.includes("failed") || result.includes(":") ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-400"}`}>{result}</pre> : null}
        </DialogFrame>
    );
}

async function resolveFavoriteItem(kind: FavoriteKind, id: string, signal: AbortSignal): Promise<FavoriteItem> {
    const endpoint = kind === "friend" ? `/api/users/${id}` : kind === "avatar" ? `/api/avatars/${id}` : `/api/worlds/${id}`;
    const response = await fetch(endpoint, { cache: "no-store", signal });
    const body = (await response.json()) as { avatar?: VrchatAvatar; error?: string; user?: VrchatUser; world?: VrchatWorld };
    if (response.status === 401) window.location.assign("/login");
    const item = body.user || body.avatar || body.world;
    if (!response.ok || !item) throw new Error(body.error || "The item could not be loaded.");
    return item;
}

function FavoriteExportDialog({ kind, currentEntries, allEntries, remoteGroups, localGroups, close }: { kind: FavoriteKind; currentEntries: DisplayEntry[]; allEntries: DisplayEntry[]; remoteGroups: FavoriteGroupView[]; localGroups: LocalGroup[]; close: () => void }) {
    const [scope, setScope] = useState<"all" | "current">("current");
    const [fields, setFields] = useState<ExportField[]>(["ID", "Name"]);
    const source = scope === "all" ? allEntries : currentEntries;
    const text = exportCsv(source, fields, remoteGroups, localGroups, kind);

    function toggle(field: ExportField) {
        setFields((current) => (current.includes(field) ? current.filter((value) => value !== field) : [...current, field]));
    }

    function download() {
        const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `vrcx-favorite-${kind}s.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    return (
        <DialogFrame title={`Export favorite ${kind}s`} close={close} wide>
            <div className="mt-4 flex flex-wrap gap-2">
                {(["ID", "Name", "Status/Author", "Group", "Source"] as ExportField[]).map((field) => (
                    <label key={field} className="inline-flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={fields.includes(field)} onChange={() => toggle(field)} className="accent-primary" />
                        {field}
                    </label>
                ))}
            </div>
            <label className="mt-4 block text-xs">
                Export scope
                <select value={scope} onChange={(event) => setScope(event.target.value as "all" | "current")} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2">
                    <option value="current">Current group or search ({currentEntries.length})</option>
                    <option value="all">
                        All {kind} favorites ({allEntries.length})
                    </option>
                </select>
            </label>
            <textarea readOnly value={text} rows={12} className="mt-4 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-[10px]" aria-label="Favorite CSV export" />
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => void navigator.clipboard.writeText(text)} disabled={!text} className="h-9 rounded-md border border-input px-3 text-xs disabled:opacity-40">
                    Copy
                </button>
                <button type="button" onClick={download} disabled={!text} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                    <Download className="size-4" /> Download CSV
                </button>
            </div>
        </DialogFrame>
    );
}

function exportCsv(entries: DisplayEntry[], fields: ExportField[], remoteGroups: FavoriteGroupView[], localGroups: LocalGroup[], kind: FavoriteKind) {
    return formatFavoriteCsv(
        fields,
        entries.map((entry) => {
            const values: Record<ExportField, string> = {
                ID: entry.objectId,
                Name: itemName(entry.item),
                "Status/Author": kind === "friend" ? (entry.item as VrchatUser).statusDescription || "" : (entry.item as VrchatAvatar | VrchatWorld).authorName || "",
                Group: entry.remoteGroupKey ? remoteGroups.find((group) => group.key === entry.remoteGroupKey)?.displayName || "" : localGroups.find((group) => group.groupId === entry.groupId)?.name || "",
                Source: entry.source === "remote" ? "VRChat" : "Local",
            };
            return values;
        }),
    );
}

function DialogFrame({ title, close, children, wide = false }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
    return (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-3">
            <div className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-2xl ${wide ? "max-w-2xl" : "max-w-sm"}`}>
                <header className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    <button type="button" onClick={close} className="ml-auto inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </header>
                {children}
            </div>
        </div>
    );
}

function RemoteGroupDialog({ group, close, saved, cleared }: { group: FavoriteGroupView; close: () => void; saved: (group: VrchatFavoriteGroup) => void; cleared: () => void }) {
    const [name, setName] = useState(group.displayName);
    const [visibility, setVisibility] = useState(group.visibility);
    async function save() {
        const response = await fetch(`/api/favorite-groups/${group.type}/${group.name}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, visibility }) });
        const result = (await response.json()) as { group?: VrchatFavoriteGroup };
        if (response.ok && result.group) saved(result.group);
        close();
    }
    async function clear() {
        if (!window.confirm(`Clear ${group.displayName}?`)) return;
        const response = await fetch(`/api/favorite-groups/${group.type}/${group.name}`, { method: "DELETE" });
        if (response.ok) cleared();
        close();
    }
    return (
        <DialogFrame title="Manage favorite group" close={close}>
            <label className="mt-4 block text-xs">
                Display name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={64} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" />
            </label>
            <label className="mt-3 block text-xs">
                Visibility
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2">
                    <option value="private">Private</option>
                    <option value="friends">Friends</option>
                    <option value="public">Public</option>
                </select>
            </label>
            <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => void clear()} className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-4" /> Clear
                </button>
                <button type="button" onClick={close} className="ml-auto h-9 rounded-md bg-secondary px-3 text-xs">
                    Cancel
                </button>
                <button type="button" onClick={() => void save()} className="h-9 rounded-md bg-primary px-3 text-xs text-primary-foreground">
                    Save
                </button>
            </div>
        </DialogFrame>
    );
}

function LocalGroupDialog({ group, close, rename, remove }: { group: LocalGroup; close: () => void; rename: (name: string) => Promise<void>; remove: () => Promise<void> }) {
    const [name, setName] = useState(group.name);
    return (
        <DialogFrame title="Manage local group" close={close}>
            <label className="mt-4 block text-xs">
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={64} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" />
            </label>
            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={() => {
                        if (window.confirm(`Delete ${group.name} and its local favorites?`)) void remove().then(close);
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="size-4" /> Delete
                </button>
                <button type="button" onClick={close} className="ml-auto h-9 rounded-md bg-secondary px-3 text-xs">
                    Cancel
                </button>
                <button type="button" onClick={() => void rename(name).then(close)} disabled={!name.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                    <Pencil className="size-4" /> Save
                </button>
            </div>
        </DialogFrame>
    );
}
