"use client";

import { type FormEvent, useState } from "react";

import { ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";

import { friendImage } from "@/lib/friends";
import type { VrchatGroup, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";
import { useFriends } from "../friends/friends-provider";

type SearchType = "users" | "worlds" | "groups";
type SearchResult = VrchatUser | VrchatWorld | VrchatGroup;

const tabs: Array<{ type: SearchType; label: string; icon: string }> = [
    { type: "users", label: "Users", icon: "ri-user-line" },
    { type: "worlds", label: "Worlds", icon: "ri-earth-line" },
    { type: "groups", label: "Groups", icon: "ri-group-line" },
];

export function SearchView() {
    const { openUser } = useFriends();
    const [type, setType] = useState<SearchType>("users");
    const [query, setQuery] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searched, setSearched] = useState(false);

    async function runSearch(nextOffset: number, nextType = type, nextQuery = submittedQuery || query) {
        const trimmed = nextQuery.trim();
        if (!trimmed) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/search?type=${nextType}&q=${encodeURIComponent(trimmed)}&offset=${nextOffset}`, { cache: "no-store" });
            const payload = (await response.json()) as { error?: string; results?: SearchResult[] };
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok || !payload.results) throw new Error(payload.error || "Search failed.");
            setResults(payload.results);
            setOffset(nextOffset);
            setSubmittedQuery(trimmed);
            setSearched(true);
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : "Search failed.");
        } finally {
            setLoading(false);
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void runSearch(0, type, query);
    }

    function changeType(nextType: SearchType) {
        setType(nextType);
        setResults([]);
        setOffset(0);
        setSearched(false);
        setError("");
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="search-heading">
            <div className="border-b border-border px-2 pt-2">
                <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Search type">
                    {tabs.map((tab) => (
                        <button
                            key={tab.type}
                            type="button"
                            role="tab"
                            aria-selected={type === tab.type}
                            onClick={() => changeType(tab.type)}
                            className={`inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium transition ${type === tab.type ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                            <i className={`${tab.icon} text-base`} aria-hidden="true" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <form onSubmit={submit} className="flex gap-2 border-b border-border p-2">
                <label className="relative min-w-0 flex-1 sm:max-w-xl">
                    <span className="sr-only">Search {type}</span>
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                        placeholder={`Search ${type}`}
                        minLength={1}
                        maxLength={128}
                        required
                    />
                </label>
                <button type="submit" disabled={loading || !query.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Search aria-hidden="true" className="size-4" />}
                    <span className="hidden sm:inline">Search</span>
                </button>
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                <h1 id="search-heading" className="sr-only">
                    Search VRChat
                </h1>
                {error ? <p className="mx-auto mt-10 max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive">{error}</p> : null}
                {!error && !searched && !loading ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                        <Search aria-hidden="true" className="size-9" />
                        <p className="text-sm">Search VRChat {type}.</p>
                    </div>
                ) : null}
                {!error && searched && results.length === 0 && !loading ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                        <Users aria-hidden="true" className="size-9" />
                        <p className="text-sm">
                            No {type} found for “{submittedQuery}”.
                        </p>
                    </div>
                ) : null}
                {loading && results.length === 0 ? <SearchSkeleton /> : null}
                {results.length ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">
                        {type === "users" ? (results as VrchatUser[]).map((user) => <UserResult key={user.id} user={user} onOpen={() => openUser(user.id)} />) : null}
                        {type === "worlds" ? (results as VrchatWorld[]).map((world) => <WorldResult key={world.id} world={world} />) : null}
                        {type === "groups" ? (results as VrchatGroup[]).map((group) => <GroupResult key={group.id} group={group} />) : null}
                    </div>
                ) : null}
            </div>

            {searched && (offset > 0 || results.length === 10) ? (
                <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border p-2">
                    <button type="button" onClick={() => void runSearch(Math.max(0, offset - 10))} disabled={loading || offset === 0} className="inline-flex h-9 items-center gap-1 rounded-md bg-secondary px-3 text-xs disabled:opacity-40">
                        <ChevronLeft aria-hidden="true" className="size-4" />
                        Previous
                    </button>
                    <span className="px-2 text-xs text-muted-foreground">Page {Math.floor(offset / 10) + 1}</span>
                    <button type="button" onClick={() => void runSearch(offset + 10)} disabled={loading || results.length < 10} className="inline-flex h-9 items-center gap-1 rounded-md bg-secondary px-3 text-xs disabled:opacity-40">
                        Next
                        <ChevronRight aria-hidden="true" className="size-4" />
                    </button>
                </div>
            ) : null}
        </section>
    );
}

function UserResult({ user, onOpen }: { user: VrchatUser; onOpen: () => void }) {
    const image = friendImage(user);
    return (
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-xs transition hover:bg-muted">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">{image ? <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <i className="ri-user-line text-xl" aria-hidden="true" />}</span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.statusDescription || user.bio || user.id}</span>
            </span>
        </button>
    );
}

function WorldResult({ world }: { world: VrchatWorld }) {
    return (
        <a href={`https://vrchat.com/home/world/${encodeURIComponent(world.id)}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:bg-muted">
            <div className="aspect-[16/9] bg-muted">
                {world.thumbnailImageUrl ? (
                    <img src={world.thumbnailImageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                    <span className="flex size-full items-center justify-center">
                        <i className="ri-earth-line text-3xl text-muted-foreground" aria-hidden="true" />
                    </span>
                )}
            </div>
            <div className="p-3">
                <p className="truncate text-sm font-semibold">{world.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">by {world.authorName || "Unknown"}</p>
                <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                    {world.occupants !== undefined ? (
                        <span>
                            <i className="ri-group-line" aria-hidden="true" /> {world.occupants}
                        </span>
                    ) : null}
                    {world.favorites !== undefined ? (
                        <span>
                            <i className="ri-star-line" aria-hidden="true" /> {world.favorites.toLocaleString()}
                        </span>
                    ) : null}
                </div>
            </div>
        </a>
    );
}

function GroupResult({ group }: { group: VrchatGroup }) {
    return (
        <a href={`https://vrchat.com/home/group/${encodeURIComponent(group.id)}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:bg-muted">
            <div className="h-20 bg-muted">{group.bannerUrl ? <img src={group.bannerUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}</div>
            <div className="relative p-3 pt-7">
                <span className="absolute -top-7 left-3 flex size-14 items-center justify-center overflow-hidden rounded-xl border-2 border-card bg-muted">
                    {group.iconUrl ? <img src={group.iconUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <i className="ri-group-line text-2xl text-muted-foreground" aria-hidden="true" />}
                </span>
                <p className="truncate text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.shortCode || group.id}</p>
                <p className="mt-2 line-clamp-2 min-h-8 text-xs text-foreground/80">{group.description || "No description."}</p>
                {group.memberCount !== undefined ? <p className="mt-2 text-[10px] text-muted-foreground">{group.memberCount.toLocaleString()} members</p> : null}
            </div>
        </a>
    );
}

function SearchSkeleton() {
    const ids = ["search-skeleton-a", "search-skeleton-b", "search-skeleton-c", "search-skeleton-d", "search-skeleton-e", "search-skeleton-f"];
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3" aria-label="Loading search results">
            {ids.map((id) => (
                <div key={id} className="h-24 animate-pulse rounded-xl border border-border bg-muted/50" />
            ))}
        </div>
    );
}
