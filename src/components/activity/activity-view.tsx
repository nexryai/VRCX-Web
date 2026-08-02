"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Activity, MapPin, Search, Trash2, UserMinus, Users, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import { ACTIVITY_UPDATED_EVENT, clearActivityLog, deleteActivityEntry, type FriendActivity, readActivityLog } from "@/lib/activity-log";

type ActivityMode = "feed" | "friend-log";

const modeTypes = {
    feed: ["GPS", "Online", "Offline", "Status", "Avatar", "Bio"],
    "friend-log": ["Friend", "Unfriend", "DisplayName"],
} as const;

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function conciseValue(value?: string) {
    if (!value) return "None";
    if (/^https?:\/\//i.test(value)) return "Avatar image";
    return value.replaceAll("\n", " · ");
}

function activityDescription(entry: FriendActivity) {
    if (entry.type === "Friend") return "Added as a friend";
    if (entry.type === "Unfriend") return "Removed from friends";
    if (entry.type === "Online") return "Came online";
    if (entry.type === "Offline") return "Went offline";
    if (entry.type === "DisplayName") return `Display name changed from ${conciseValue(entry.previous)} to ${conciseValue(entry.current)}`;
    if (entry.type === "GPS") return `Location changed from ${conciseValue(entry.previous)} to ${conciseValue(entry.current)}`;
    if (entry.type === "Status") return `Status changed from ${conciseValue(entry.previous)} to ${conciseValue(entry.current)}`;
    if (entry.type === "Avatar") return "Avatar changed";
    return "Bio changed";
}

export function ActivityView({ mode }: { mode: ActivityMode }) {
    const currentUser = useCurrentUser();
    const { openUser } = useFriends();
    const [entries, setEntries] = useState<FriendActivity[]>([]);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [confirmClear, setConfirmClear] = useState(false);

    const reload = useCallback(() => setEntries(readActivityLog(currentUser.id)), [currentUser.id]);
    useEffect(() => {
        reload();
        window.addEventListener(ACTIVITY_UPDATED_EVENT, reload);
        window.addEventListener("storage", reload);
        return () => {
            window.removeEventListener(ACTIVITY_UPDATED_EVENT, reload);
            window.removeEventListener("storage", reload);
        };
    }, [reload]);

    const allowedTypes = modeTypes[mode];
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return entries.filter((entry) => {
            if (!(allowedTypes as readonly string[]).includes(entry.type)) return false;
            if (typeFilter !== "all" && entry.type !== typeFilter) return false;
            return !query || `${entry.displayName} ${entry.userId} ${activityDescription(entry)}`.toLocaleLowerCase().includes(query);
        });
    }, [allowedTypes, entries, search, typeFilter]);

    function removeEntry(entryId: string) {
        deleteActivityEntry(currentUser.id, entryId);
        reload();
    }

    function clearEntries() {
        clearActivityLog(currentUser.id);
        setConfirmClear(false);
        reload();
    }

    const title = mode === "feed" ? "Feed" : "Friend Log";
    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="activity-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-xs" aria-label={`Filter ${title} type`}>
                    <option value="all">All event types</option>
                    {allowedTypes.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </select>
                <label className="relative min-w-44 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder={`Search ${title.toLocaleLowerCase()}`} />
                </label>
                {confirmClear ? (
                    <span className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => setConfirmClear(false)} className="inline-flex size-9 items-center justify-center rounded-md bg-secondary" aria-label="Cancel clear">
                            <X aria-hidden="true" className="size-4" />
                        </button>
                        <button type="button" onClick={clearEntries} className="h-9 rounded-md bg-destructive px-3 text-xs text-white">
                            Clear history
                        </button>
                    </span>
                ) : (
                    <button type="button" onClick={() => setConfirmClear(true)} disabled={!entries.length} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
                        <Trash2 aria-hidden="true" className="size-4" />
                        <span className="hidden sm:inline">Clear</span>
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
                <h1 id="activity-heading" className="sr-only">
                    {title}
                </h1>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    {mode === "feed" ? <Activity aria-hidden="true" className="size-4" /> : <Users aria-hidden="true" className="size-4" />}
                    {filtered.length} stored events
                </div>
                {!filtered.length ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                        {mode === "feed" ? <MapPin aria-hidden="true" className="size-8" /> : <UserMinus aria-hidden="true" className="size-8" />}
                        <p className="max-w-md text-sm">Events appear after the browser observes a change during periodic VRChat API refreshes.</p>
                    </div>
                ) : null}
                <div className="space-y-2 md:hidden">
                    {filtered.map((entry) => (
                        <ActivityCard key={entry.id} entry={entry} onOpen={() => openUser(entry.userId)} onDelete={() => removeEntry(entry.id)} />
                    ))}
                </div>
                {filtered.length ? (
                    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                        <table className="w-full min-w-[760px] text-left text-xs">
                            <thead className="sticky top-0 bg-muted text-[10px] tracking-wide text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">User</th>
                                    <th className="px-3 py-2">Change</th>
                                    <th className="w-14 px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-muted/60">
                                        <td className="whitespace-nowrap border-t border-border px-3 py-2 text-muted-foreground">{formatDate(entry.createdAt)}</td>
                                        <td className="border-t border-border px-3 py-2">
                                            <span className="rounded-md border border-border px-2 py-1 text-[10px]">{entry.type}</span>
                                        </td>
                                        <td className="max-w-48 border-t border-border px-3 py-2">
                                            <button type="button" onClick={() => openUser(entry.userId)} className="max-w-full truncate hover:text-primary">
                                                {entry.displayName}
                                            </button>
                                        </td>
                                        <td className="border-t border-border px-3 py-2 text-muted-foreground">{activityDescription(entry)}</td>
                                        <td className="border-t border-border px-3 py-2">
                                            <button type="button" onClick={() => removeEntry(entry.id)} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete event">
                                                <Trash2 aria-hidden="true" className="size-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function ActivityCard({ entry, onOpen, onDelete }: { entry: FriendActivity; onOpen: () => void; onDelete: () => void }) {
    return (
        <article className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border px-2 py-1 text-[10px]">{entry.type}</span>
                        <time className="text-[10px] text-muted-foreground">{formatDate(entry.createdAt)}</time>
                    </div>
                    <button type="button" onClick={onOpen} className="mt-2 block max-w-full truncate text-left text-sm font-medium hover:text-primary">
                        {entry.displayName}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">{activityDescription(entry)}</p>
                </div>
                <button type="button" onClick={onDelete} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete event">
                    <Trash2 aria-hidden="true" className="size-3.5" />
                </button>
            </div>
        </article>
    );
}
