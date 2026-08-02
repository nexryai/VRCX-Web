"use client";

import { useMemo, useState } from "react";

import { RefreshCw, Search } from "lucide-react";

import { locationLabel } from "@/lib/friends";
import { FriendAvatar } from "./friend-avatar";
import { useFriends } from "./friends-provider";

export function FriendsSidebar() {
    const { friends, loading, refresh, openUser } = useFriends();
    const [search, setSearch] = useState("");
    const visibleFriends = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return friends.filter((friend) => !query || friend.displayName.toLocaleLowerCase().includes(query)).toSorted((a, b) => a.displayName.localeCompare(b.displayName));
    }, [friends, search]);

    return (
        <aside className="hidden h-full min-h-0 w-[19rem] shrink-0 flex-col border-l border-sidebar-border bg-sidebar xl:flex" aria-label="Online friends">
            <div className="flex items-center gap-1 p-2">
                <label className="relative min-w-0 flex-1">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-2 pl-9 text-sm shadow-xs outline-none focus:border-ring" placeholder="Search friends" />
                </label>
                <button type="button" onClick={() => void refresh()} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent" aria-label="Refresh friends" disabled={loading}>
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <p className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Online — {visibleFriends.length}</p>
                <div className="space-y-0.5">
                    {visibleFriends.map((friend) => (
                        <button type="button" key={friend.id} onClick={() => openUser(friend.id)} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent">
                            <FriendAvatar friend={friend} size="sm" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{friend.displayName}</p>
                                <p className="truncate text-[10px] text-muted-foreground">{locationLabel(friend)}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </aside>
    );
}
