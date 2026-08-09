"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, EyeOff, Link as LinkIcon, Loader2, Star, UserMinus } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import type { FriendActivity } from "@/lib/activity-log";
import { trustLevelFromTags } from "@/lib/activity-log";
import { safeExternalHttpUrl } from "@/lib/browser-url";
import { statusColor } from "@/lib/friends";
import type { MutualGraphSnapshot } from "@/lib/mutual-graph";
import { fetchAndPersistMutualGraph } from "@/lib/mutual-graph-client";
import type { VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type SearchField = "Display Name" | "User Name" | "Rank" | "Status" | "Bio";
type SortKey = "number" | "displayName" | "rank" | "status" | "mutual" | "lastActivity" | "lastLogin" | "dateJoined";
type PageSize = 20 | 50 | 100;

const searchFields: SearchField[] = ["Display Name", "User Name", "Rank", "Status", "Bio"];

function formatDate(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function languages(friend: VrchatUser) {
    return (friend.tags || []).filter((tag) => tag.startsWith("language_")).map((tag) => tag.slice("language_".length).toUpperCase());
}

function compare(left: string | number, right: string | number) {
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}

export function FriendListView() {
    const currentUser = useCurrentUser();
    const { allFriends: friends, loading, error, reload, openUser, removeFriend } = useFriends();
    const [search, setSearch] = useState("");
    const [fields, setFields] = useState<SearchField[]>([]);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [snapshot, setSnapshot] = useState<MutualGraphSnapshot | null>(null);
    const [lastSeen, setLastSeen] = useState<Map<string, string>>(new Map());
    const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "number", descending: true });
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState<PageSize>(20);
    const [bulkMode, setBulkMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [profileProgress, setProfileProgress] = useState(0);
    const [mutualProgress, setMutualProgress] = useState(0);
    const [loadingMutuals, setLoadingMutuals] = useState(false);
    const [actionError, setActionError] = useState("");
    const operationController = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void Promise.all([
            fetch("/api/favorites?section=records", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { favorites?: Array<{ favoriteId?: string; type?: string }> }) => setFavoriteIds(new Set((payload.favorites || []).filter((favorite) => favorite.type === "friend" && favorite.favoriteId).map((favorite) => favorite.favoriteId as string)))),
            fetch("/api/mutual-graph", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { snapshot?: MutualGraphSnapshot | null }) => setSnapshot(payload.snapshot || null)),
            fetch("/api/activity?limit=2000", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { entries?: FriendActivity[] }) => {
                    const next = new Map<string, string>();
                    for (const entry of payload.entries || []) if (!next.has(entry.userId) && ["GPS", "Online", "Offline"].includes(entry.type)) next.set(entry.userId, entry.createdAt);
                    setLastSeen(next);
                }),
            fetch("/api/settings", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { friendListTablePageSize?: PageSize }) => setPageSize(payload.friendListTablePageSize || 20)),
        ]).catch(() => undefined);
        return () => {
            controller.abort();
            operationController.current?.abort();
        };
    }, []);

    const friendNumbers = useMemo(() => new Map(friends.map((friend, index) => [friend.id, friends.length - index])), [friends]);
    const mutualCount = (friend: VrchatUser) => snapshot?.relationships[friend.id]?.length || 0;
    const filteredFriends = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const activeFields = fields.length ? fields : searchFields;
        const valueFor = (friend: VrchatUser, field: SearchField) => {
            if (field === "Display Name") return friend.displayName;
            if (field === "User Name") return friend.username || "";
            if (field === "Rank") return trustLevelFromTags(friend.tags);
            if (field === "Status") return `${friend.status || ""} ${friend.statusDescription || ""}`;
            return friend.bio || "";
        };
        const sortValue = (friend: VrchatUser) => {
            if (sort.key === "number") return friendNumbers.get(friend.id) || 0;
            if (sort.key === "displayName") return friend.displayName;
            if (sort.key === "rank") return trustLevelFromTags(friend.tags);
            if (sort.key === "status") return `${friend.status || "offline"} ${friend.statusDescription || ""}`;
            if (sort.key === "mutual") return snapshot?.relationships[friend.id]?.length || 0;
            if (sort.key === "lastActivity") return friend.last_activity || lastSeen.get(friend.id) || "";
            if (sort.key === "lastLogin") return friend.last_login || "";
            return friend.date_joined || "";
        };
        return friends
            .filter((friend) => (!favoritesOnly || favoriteIds.has(friend.id)) && (!query || activeFields.some((field) => valueFor(friend, field).toLocaleLowerCase().includes(query))))
            .toSorted((left, right) => (sort.descending ? -1 : 1) * compare(sortValue(left), sortValue(right)) || left.displayName.localeCompare(right.displayName));
    }, [favoriteIds, favoritesOnly, fields, friendNumbers, friends, lastSeen, search, snapshot, sort]);

    const pageCount = Math.max(1, Math.ceil(filteredFriends.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const visible = filteredFriends.slice(safePage * pageSize, (safePage + 1) * pageSize);

    function changeSort(key: SortKey, descendingFirst = false) {
        setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: descendingFirst }));
    }

    function toggleField(field: SearchField) {
        setFields((current) => (current.includes(field) ? current.filter((value) => value !== field) : [...current, field]));
        setPage(0);
    }

    function toggleSelected(id: string) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function unfriend(friend: VrchatUser, confirmation = true) {
        if (confirmation && !window.confirm(`Remove ${friend.displayName} from your friends?`)) return false;
        setBusyIds((current) => new Set(current).add(friend.id));
        setActionError("");
        try {
            const response = await fetch(`/api/friends/${encodeURIComponent(friend.id)}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The friend could not be removed.");
            removeFriend(friend.id);
            return true;
        } catch (requestError) {
            setActionError(requestError instanceof Error ? requestError.message : "The friend could not be removed.");
            return false;
        } finally {
            setBusyIds((current) => {
                const next = new Set(current);
                next.delete(friend.id);
                return next;
            });
        }
    }

    async function bulkUnfriend() {
        const pending = friends.filter((friend) => selected.has(friend.id));
        if (!pending.length || !window.confirm(`Delete ${pending.length} friends? This action cannot be undone.\n\n${pending.map((friend) => friend.displayName).join("\n")}`)) return;
        for (const friend of pending) {
            if (await unfriend(friend, false)) setSelected((current) => new Set([...current].filter((id) => id !== friend.id)));
        }
    }

    async function loadProfiles() {
        operationController.current?.abort();
        const controller = new AbortController();
        operationController.current = controller;
        setLoadingProfiles(true);
        setProfileProgress(0);
        setActionError("");
        try {
            for (let index = 0; index < friends.length; index += 1) {
                const response = await fetch(`/api/users/${encodeURIComponent(friends[index].id)}`, { cache: "no-store", signal: controller.signal });
                if (response.status === 401) {
                    window.location.assign("/login");
                    return;
                }
                setProfileProgress(index + 1);
            }
            await reload();
        } catch (requestError) {
            if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setActionError(requestError instanceof Error ? requestError.message : "Friend profiles could not be loaded.");
        } finally {
            setLoadingProfiles(false);
        }
    }

    async function loadMutuals() {
        if (currentUser.hasSharedConnectionsOptOut) return;
        operationController.current?.abort();
        const controller = new AbortController();
        operationController.current = controller;
        setLoadingMutuals(true);
        setMutualProgress(0);
        setActionError("");
        try {
            const result = await fetchAndPersistMutualGraph(friends, controller.signal, setMutualProgress);
            setSnapshot(result.snapshot);
            if (!result.persisted) setActionError("The mutual graph was loaded but could not be saved to MongoDB.");
        } catch (requestError) {
            if (requestError && typeof requestError === "object" && "status" in requestError && requestError.status === 401) window.location.assign("/login");
            if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setActionError(requestError instanceof Error ? requestError.message : "Mutual friends could not be loaded.");
        } finally {
            setLoadingMutuals(false);
        }
    }

    function updatePageSize(value: PageSize) {
        setPageSize(value);
        setPage(0);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ friendListTablePageSize: value }) });
    }

    return (
        <section className="flex h-full min-h-0 flex-col p-2" aria-labelledby="friend-list-heading">
            <h1 id="friend-list-heading" className="sr-only">
                Friend List
            </h1>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setFavoritesOnly((value) => !value);
                            setPage(0);
                        }}
                        className={`inline-flex size-8 items-center justify-center rounded-md border border-input ${favoritesOnly ? "text-yellow-400" : "text-muted-foreground"}`}
                        aria-label="Favorites only"
                        aria-pressed={favoritesOnly}
                        title="Favorites only"
                    >
                        <Star className="size-4" fill={favoritesOnly ? "currentColor" : "none"} />
                    </button>
                    <details className="relative w-40">
                        <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-input px-3 text-xs [&::-webkit-details-marker]:hidden">
                            <span className="truncate text-muted-foreground">{fields.length ? fields.join(", ") : "Filter fields"}</span>
                            <ChevronDown className="size-4 shrink-0" />
                        </summary>
                        <div className="absolute top-10 left-0 z-30 w-48 rounded-md border border-border bg-popover p-1 shadow-xl">
                            {searchFields.map((field) => (
                                <label key={field} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted">
                                    <input type="checkbox" checked={fields.includes(field)} onChange={() => toggleField(field)} className="accent-primary" />
                                    {field}
                                </label>
                            ))}
                        </div>
                    </details>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(0);
                        }}
                        className="h-9 w-64 max-w-full rounded-md border border-input bg-background px-3 text-xs"
                        placeholder="Search friends"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {bulkMode && selected.size ? (
                        <button type="button" onClick={() => void bulkUnfriend()} className="h-9 rounded-md border border-input px-3 text-xs">
                            Unfriend Selected ({selected.size})
                        </button>
                    ) : null}
                    <label className="flex items-center gap-2 text-xs">
                        Bulk Unfriend
                        <button
                            type="button"
                            onClick={() => {
                                setBulkMode((value) => !value);
                                setSelected(new Set());
                            }}
                            className={`relative h-5 w-9 rounded-full transition-colors ${bulkMode ? "bg-primary" : "bg-muted"}`}
                            role="switch"
                            aria-checked={bulkMode}
                        >
                            <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${bulkMode ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                    </label>
                    <button type="button" onClick={() => void loadMutuals()} disabled={loadingMutuals || currentUser.hasSharedConnectionsOptOut || !friends.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs disabled:opacity-50">
                        {loadingMutuals ? <Loader2 className="size-4 animate-spin" /> : null}
                        {loadingMutuals ? `${mutualProgress}/${friends.length}` : "Load Mutual Friends"}
                    </button>
                    <button type="button" onClick={() => void loadProfiles()} disabled={loadingProfiles || !friends.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs disabled:opacity-50">
                        {loadingProfiles ? <Loader2 className="size-4 animate-spin" /> : null}
                        {loadingProfiles ? `${profileProgress}/${friends.length}` : "Load"}
                    </button>
                </div>
            </div>

            {error || actionError ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{actionError || error}</p> : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading friends" />
                    </div>
                ) : null}
                {!loading && !visible.length ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">No friends match the current filters.</div> : null}
                {!loading && visible.length ? (
                    <table className="w-max min-w-full table-fixed text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                            <tr>
                                <th className="w-5" />
                                {bulkMode ? <th className="w-12" /> : null}
                                <SortableHeader label="No" width="w-20" active={sort.key === "number"} onClick={() => changeSort("number", true)} />
                                <th className="w-16 px-2 py-2">Avatar</th>
                                <SortableHeader label="Display Name" width="w-48" active={sort.key === "displayName"} onClick={() => changeSort("displayName")} />
                                <SortableHeader label="Rank" width="w-32" active={sort.key === "rank"} onClick={() => changeSort("rank")} />
                                <SortableHeader label="Status" width="w-64" active={sort.key === "status"} onClick={() => changeSort("status")} />
                                <th className="w-28 px-2 py-2">Language</th>
                                <th className="w-28 px-2 py-2">Bio Links</th>
                                <SortableHeader label="Mutual Friends" width="w-32" active={sort.key === "mutual"} onClick={() => changeSort("mutual", true)} />
                                <th className="w-44 px-2 py-2">Last Seen</th>
                                <SortableHeader label="Last Activity" width="w-44" active={sort.key === "lastActivity"} onClick={() => changeSort("lastActivity", true)} />
                                <SortableHeader label="Last Login" width="w-44" active={sort.key === "lastLogin"} onClick={() => changeSort("lastLogin", true)} />
                                <SortableHeader label="Date Joined" width="w-32" active={sort.key === "dateJoined"} onClick={() => changeSort("dateJoined", true)} />
                                <th className="w-24 px-2 py-2 text-center">Unfriend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((friend) => (
                                <tr key={friend.id} onClick={() => openUser(friend.id)} className="cursor-pointer hover:bg-muted/50">
                                    <td className="border-t border-border" />
                                    {bulkMode ? (
                                        <td className="border-t border-border px-2 py-2" onClick={(event) => event.stopPropagation()}>
                                            <input type="checkbox" checked={selected.has(friend.id)} onChange={() => toggleSelected(friend.id)} className="accent-primary" aria-label={`Select ${friend.displayName}`} />
                                        </td>
                                    ) : null}
                                    <td className="border-t border-border px-2 py-2 text-muted-foreground">{friendNumbers.get(friend.id)}</td>
                                    <td className="border-t border-border px-2 py-2">
                                        <FriendAvatar friend={friend} size="sm" />
                                    </td>
                                    <td className="truncate border-t border-border px-2 py-2 font-medium">{friend.displayName}</td>
                                    <td className="border-t border-border px-2 py-2">{trustLevelFromTags(friend.tags)}</td>
                                    <td className="border-t border-border px-2 py-2">
                                        <span className="flex items-center gap-1">
                                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor(friend.status) }} />
                                            {friend.statusDescription || friend.status || "Offline"}
                                        </span>
                                    </td>
                                    <td className="border-t border-border px-2 py-2">
                                        <div className="flex gap-1">
                                            {languages(friend).map((language) => (
                                                <span key={language} className="rounded border border-border px-1 text-[9px]" title={language}>
                                                    {language}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="border-t border-border px-2 py-2" onClick={(event) => event.stopPropagation()}>
                                        <div className="flex gap-1">
                                            {(friend.bioLinks || [])
                                                .map((link) => safeExternalHttpUrl(link))
                                                .filter(Boolean)
                                                .map((link) => (
                                                    <a key={link} href={link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" title={link}>
                                                        <LinkIcon className="size-3.5" />
                                                    </a>
                                                ))}
                                        </div>
                                    </td>
                                    <td className="border-t border-border px-2 py-2 text-right">{snapshot?.optedOut.includes(friend.id) ? <EyeOff className="inline size-3.5 text-muted-foreground" aria-label="Mutual connections unavailable" /> : mutualCount(friend) || ""}</td>
                                    <td className="whitespace-nowrap border-t border-border px-2 py-2">{formatDate(lastSeen.get(friend.id))}</td>
                                    <td className="whitespace-nowrap border-t border-border px-2 py-2">{formatDate(friend.last_activity)}</td>
                                    <td className="whitespace-nowrap border-t border-border px-2 py-2">{formatDate(friend.last_login)}</td>
                                    <td className="whitespace-nowrap border-t border-border px-2 py-2">{friend.date_joined || ""}</td>
                                    <td className="border-t border-border px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                                        <button type="button" onClick={() => void unfriend(friend)} disabled={busyIds.has(friend.id)} className="inline-flex size-7 items-center justify-center text-destructive disabled:opacity-40" aria-label={`Unfriend ${friend.displayName}`}>
                                            {busyIds.has(friend.id) ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
                <span>
                    {filteredFriends.length} friend{filteredFriends.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1">
                        Rows{" "}
                        <select value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)} className="h-7 rounded border border-input bg-background px-1 text-[10px]">
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </label>
                    <span>
                        {safePage + 1} / {pageCount}
                    </span>
                    <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Previous page">
                        <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage + 1 >= pageCount} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Next page">
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            </div>
        </section>
    );
}

function SortableHeader({ label, width, active, onClick }: { label: string; width: string; active: boolean; onClick: () => void }) {
    return (
        <th className={`${width} px-2 py-2`}>
            <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
                {label}
                <ArrowUpDown className="size-3.5" />
            </button>
        </th>
    );
}
