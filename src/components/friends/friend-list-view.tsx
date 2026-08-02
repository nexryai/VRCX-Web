"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Loader2, RefreshCw, Search, Users } from "lucide-react";

import { locationLabel } from "@/lib/friends";
import { fetchAllFriends } from "@/lib/friends-client";
import type { VrchatUser } from "@/lib/vrchat/types";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

type StatusFilter = "all" | "online" | "offline";
type SortKey = "name" | "status" | "last-active";

function formatLastActive(friend: VrchatUser) {
    const value = friend.last_activity || friend.last_login;
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function FriendListView() {
    const { friends: onlineFriends, loading: onlineLoading, error: onlineError, refresh: refreshOnline, openUser } = useFriends();
    const [offlineFriends, setOfflineFriends] = useState<VrchatUser[]>([]);
    const [offlineLoading, setOfflineLoading] = useState(true);
    const [offlineError, setOfflineError] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const controllerRef = useRef<AbortController | null>(null);

    const loadOffline = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setOfflineLoading(true);
        setOfflineError("");
        try {
            setOfflineFriends(await fetchAllFriends(true, controller.signal));
        } catch (loadError) {
            if (loadError instanceof DOMException && loadError.name === "AbortError") return;
            setOfflineError(loadError instanceof Error ? loadError.message : "Offline friends could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setOfflineLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadOffline();
        return () => controllerRef.current?.abort();
    }, [loadOffline]);

    const friends = useMemo(() => {
        const onlineIds = new Set(onlineFriends.map((friend) => friend.id));
        return [...onlineFriends, ...offlineFriends.filter((friend) => !onlineIds.has(friend.id))];
    }, [onlineFriends, offlineFriends]);

    const filteredFriends = useMemo(() => {
        const onlineIds = new Set(onlineFriends.map((friend) => friend.id));
        const query = search.trim().toLocaleLowerCase();
        return friends
            .filter((friend) => {
                const online = onlineIds.has(friend.id);
                if (statusFilter === "online" && !online) return false;
                if (statusFilter === "offline" && online) return false;
                return !query || `${friend.displayName} ${friend.statusDescription || ""} ${friend.id}`.toLocaleLowerCase().includes(query);
            })
            .toSorted((a, b) => {
                if (sortKey === "status") {
                    const onlineDifference = Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id));
                    if (onlineDifference) return onlineDifference;
                }
                if (sortKey === "last-active") {
                    const difference = Date.parse(b.last_activity || b.last_login || "") - Date.parse(a.last_activity || a.last_login || "");
                    if (Number.isFinite(difference) && difference) return difference;
                }
                return a.displayName.localeCompare(b.displayName);
            });
    }, [friends, onlineFriends, search, statusFilter, sortKey]);

    const loading = onlineLoading || offlineLoading;
    const error = onlineError || offlineError;

    async function refreshAll() {
        await Promise.all([refreshOnline(), loadOffline()]);
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="friend-list-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <label className="relative min-w-48 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder="Filter friend list" />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter by status">
                    <option value="all">All friends</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                </select>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="h-9 rounded-md border border-input bg-background px-2 text-xs" aria-label="Sort friends">
                    <option value="name">Name</option>
                    <option value="status">Status</option>
                    <option value="last-active">Last active</option>
                </select>
                <button type="button" onClick={() => void refreshAll()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh friend list">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
                <h1 id="friend-list-heading" className="sr-only">
                    Friend List
                </h1>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Users aria-hidden="true" className="size-4" />
                    {filteredFriends.length} of {friends.length} friends
                    {loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                </div>
                {error ? <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
                {!loading && !error && filteredFriends.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">No friends match the current filters.</p> : null}

                <div className="space-y-1.5 md:hidden">
                    {filteredFriends.map((friend) => (
                        <button type="button" key={friend.id} onClick={() => openUser(friend.id)} className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted">
                            <FriendAvatar friend={friend} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{friend.displayName}</span>
                                <span className="block truncate text-xs text-muted-foreground">{locationLabel(friend)}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">{formatLastActive(friend)}</span>
                        </button>
                    ))}
                </div>

                {filteredFriends.length ? (
                    <table className="hidden w-full min-w-[760px] border-separate border-spacing-0 overflow-hidden rounded-lg border border-border text-left text-xs md:table">
                        <thead className="sticky top-0 z-10 bg-muted text-[10px] tracking-wide text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2 font-medium">Name</th>
                                <th className="px-3 py-2 font-medium">Status</th>
                                <th className="px-3 py-2 font-medium">Location</th>
                                <th className="px-3 py-2 font-medium">Platform</th>
                                <th className="px-3 py-2 font-medium">Last active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredFriends.map((friend) => (
                                <tr key={friend.id} className="border-t border-border hover:bg-muted/60">
                                    <td className="border-t border-border p-1.5">
                                        <button type="button" onClick={() => openUser(friend.id)} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted">
                                            <FriendAvatar friend={friend} size="sm" />
                                            <span className="max-w-56 truncate font-medium">{friend.displayName}</span>
                                        </button>
                                    </td>
                                    <td className="border-t border-border px-3 py-2 capitalize">{friend.status || friend.state || "offline"}</td>
                                    <td className="max-w-64 truncate border-t border-border px-3 py-2" title={locationLabel(friend)}>
                                        {locationLabel(friend)}
                                    </td>
                                    <td className="border-t border-border px-3 py-2 capitalize">{friend.platform || friend.last_platform || "unknown"}</td>
                                    <td className="whitespace-nowrap border-t border-border px-3 py-2 text-muted-foreground">{formatLastActive(friend)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : null}
            </div>
        </section>
    );
}
