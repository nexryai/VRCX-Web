"use client";

import { useMemo, useState } from "react";

import { MapPin, Pencil, RefreshCw, Search, Users } from "lucide-react";

import { groupFriendsByLocation, locationLabel } from "@/lib/friends";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

export function FriendsLocationsView() {
    const { friends, loading, error, refresh } = useFriends();
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) return friends;
        return friends.filter((friend) => `${friend.displayName} ${friend.statusDescription || ""} ${locationLabel(friend)}`.toLocaleLowerCase().includes(query));
    }, [friends, search]);
    const groups = useMemo(() => groupFriendsByLocation(filtered), [filtered]);

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="friends-locations-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <div className="relative min-w-48 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm shadow-xs outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                        placeholder="Filter friends"
                        aria-label="Filter friends"
                    />
                </div>
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground">
                    <Users aria-hidden="true" className="size-3.5" />
                    {filtered.length} online
                </span>
                <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50" aria-label="Refresh friends">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                <h1 id="friends-locations-heading" className="sr-only">
                    Friends Locations
                </h1>
                {error ? (
                    <div className="mx-auto mt-12 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center text-sm">
                        <p>{error}</p>
                        <button type="button" onClick={() => void refresh()} className="mt-3 rounded-md bg-primary px-3 py-2 text-primary-foreground">
                            Try again
                        </button>
                    </div>
                ) : null}
                {!error && loading && friends.length === 0 ? <LoadingCards /> : null}
                {!error && !loading && groups.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                        <Users aria-hidden="true" className="size-8" />
                        <p className="text-sm">{search ? "No friends match this filter." : "No friends are currently online."}</p>
                    </div>
                ) : null}
                <div className="space-y-5">
                    {groups.map((group) => (
                        <section key={group.location} aria-label={group.location}>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <MapPin aria-hidden="true" className="size-3.5" />
                                <h2 className="truncate">{group.location}</h2>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{group.members.length}</span>
                            </div>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-2.5">
                                {group.members.map((friend) => (
                                    <article key={friend.id} className="relative rounded-lg border border-border bg-card p-2 shadow-xs transition-colors hover:bg-muted">
                                        <div className="flex min-w-0 items-center gap-2.5 pr-4">
                                            <FriendAvatar friend={friend} />
                                            <p className="truncate text-[13px] font-semibold" title={friend.displayName}>
                                                {friend.displayName}
                                            </p>
                                        </div>
                                        <p className="mt-2 flex h-8 items-start gap-1 overflow-hidden rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground" title={friend.statusDescription || ""}>
                                            {friend.statusDescription ? <Pencil aria-hidden="true" className="mt-0.5 size-3 shrink-0" /> : null}
                                            <span className="line-clamp-1">{friend.statusDescription || "\u00a0"}</span>
                                        </p>
                                        <p className="mt-1.5 line-clamp-2 min-h-7 rounded-md bg-muted/60 px-2 py-1.5 text-center text-xs text-zinc-300">{locationLabel(friend)}</p>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </section>
    );
}

function LoadingCards() {
    const skeletonIds = ["friend-skeleton-a", "friend-skeleton-b", "friend-skeleton-c", "friend-skeleton-d", "friend-skeleton-e", "friend-skeleton-f", "friend-skeleton-g", "friend-skeleton-h"];

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-2.5" aria-label="Loading friends">
            {skeletonIds.map((id) => (
                <div key={id} className="h-28 animate-pulse rounded-lg border border-border bg-muted/50" />
            ))}
        </div>
    );
}
