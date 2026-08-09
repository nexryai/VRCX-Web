"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ArrowLeft, ArrowRight, Loader2, Trash2, User, Users } from "lucide-react";

import { trustLevelFromTags } from "@/lib/activity-log";
import { friendImage } from "@/lib/friends";
import type { VrchatGroup, VrchatUser, VrchatWorld } from "@/lib/vrchat/types";
import { useFriends } from "../friends/friends-provider";
import { VrchatImage } from "../vrchat-image";

type SearchType = "users" | "worlds" | "groups";
type SearchResult = VrchatUser | VrchatWorld | VrchatGroup;
type WorldSortHeading = "relevance" | "featured" | "trending" | "updated" | "created" | "publication" | "shuffle" | "active" | "recent" | "favorite" | "labs" | "heat";
type WorldRow = {
    index: string | number;
    name: string;
    sortHeading?: string;
    sortOrder?: string;
    sortOwnership?: string;
    tag?: string;
};

const tabs: Array<{ type: SearchType; label: string }> = [
    { type: "users", label: "User" },
    { type: "worlds", label: "World" },
    { type: "groups", label: "Group" },
];

const worldSortHeadings = new Set<WorldSortHeading>(["relevance", "featured", "trending", "updated", "created", "publication", "shuffle", "active", "recent", "favorite", "labs", "heat"]);
const emptyResults: Record<SearchType, SearchResult[]> = { users: [], worlds: [], groups: [] };
const emptyOffsets: Record<SearchType, number> = { users: 0, worlds: 0, groups: 0 };

function languages(user: VrchatUser) {
    return (user.tags || []).filter((tag) => tag.startsWith("language_")).map((tag) => tag.slice("language_".length).toUpperCase());
}

function resolvedWorldHeading(row?: WorldRow): WorldSortHeading {
    return row?.sortHeading && worldSortHeadings.has(row.sortHeading as WorldSortHeading) ? (row.sortHeading as WorldSortHeading) : "relevance";
}

export function SearchView() {
    const { openUser, openWorld, openGroup } = useFriends();
    const [type, setType] = useState<SearchType>("users");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Record<SearchType, SearchResult[]>>(emptyResults);
    const [offsets, setOffsets] = useState<Record<SearchType, number>>(emptyOffsets);
    const [loadingType, setLoadingType] = useState<SearchType | "">("");
    const [error, setError] = useState("");
    const [searchUserByBio, setSearchUserByBio] = useState(false);
    const [searchUserSortByLastLoggedIn, setSearchUserSortByLastLoggedIn] = useState(false);
    const [searchWorldLabs, setSearchWorldLabs] = useState(false);
    const [worldRows, setWorldRows] = useState<WorldRow[]>([]);
    const [worldCategoryIndex, setWorldCategoryIndex] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/search/config", { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                if (response.status === 401) {
                    window.location.assign("/login");
                    return null;
                }
                if (!response.ok) return null;
                return (await response.json()) as { worldRows?: WorldRow[] };
            })
            .then((payload) => setWorldRows(payload?.worldRows || []))
            .catch((loadError) => {
                if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setWorldRows([]);
            });
        return () => controller.abort();
    }, []);

    const selectedWorldRow = useMemo(() => worldRows.find((row) => String(row.index) === worldCategoryIndex), [worldCategoryIndex, worldRows]);

    const runSearch = useCallback(
        async (nextOffset: number, nextType: SearchType = type, category: WorldRow | null | undefined = selectedWorldRow) => {
            const trimmed = query.trim();
            const heading = resolvedWorldHeading(category ?? undefined);
            if (!trimmed && !(nextType === "worlds" && heading !== "relevance")) return;
            setLoadingType(nextType);
            setError("");
            try {
                const params = new URLSearchParams({ type: nextType, q: trimmed, offset: String(nextOffset) });
                if (nextType === "users") {
                    params.set("userField", searchUserByBio ? "bio" : "displayName");
                    params.set("userSort", searchUserSortByLastLoggedIn ? "last_login" : "relevance");
                }
                if (nextType === "worlds") {
                    params.set("worldLabs", String(searchWorldLabs));
                    params.set("worldSortHeading", heading);
                    params.set("worldSortOrder", category?.sortOrder === "ascending" ? "ascending" : "descending");
                    params.set("worldOwnership", category?.sortOwnership === "mine" ? "mine" : "any");
                    if (category?.tag) params.set("worldTag", category.tag);
                }
                const response = await fetch(`/api/search?${params}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; results?: SearchResult[] };
                if (response.status === 401) {
                    window.location.assign("/login");
                    return;
                }
                if (!response.ok || !payload.results) throw new Error(payload.error || "Search failed.");
                setResults((current) => ({ ...current, [nextType]: payload.results || [] }));
                setOffsets((current) => ({ ...current, [nextType]: nextOffset }));
            } catch (searchError) {
                setError(searchError instanceof Error ? searchError.message : "Search failed.");
            } finally {
                setLoadingType("");
            }
        },
        [query, searchUserByBio, searchUserSortByLastLoggedIn, searchWorldLabs, selectedWorldRow, type],
    );

    useEffect(() => {
        function handlePaginationShortcut(event: KeyboardEvent) {
            if (!event.altKey || loadingType) return;
            const current = results[type];
            const offset = offsets[type];
            if (event.key === "ArrowLeft" && offset > 0) {
                event.preventDefault();
                void runSearch(Math.max(0, offset - 10));
            }
            if (event.key === "ArrowRight" && current.length === 10) {
                event.preventDefault();
                void runSearch(offset + 10);
            }
        }
        window.addEventListener("keydown", handlePaginationShortcut);
        return () => window.removeEventListener("keydown", handlePaginationShortcut);
    }, [loadingType, offsets, results, runSearch, type]);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (type === "worlds") {
            // VRCX resets a selected discovery category when Enter starts a
            // text search, while pagination keeps the active category.
            setWorldCategoryIndex("");
            void runSearch(0, "worlds", null);
            return;
        }
        void runSearch(0);
    }

    function clearSearch() {
        setQuery("");
        setResults(emptyResults);
        setOffsets(emptyOffsets);
        setError("");
    }

    const visible = results[type];
    const offset = offsets[type];
    const loading = loadingType === type;
    const paginationVisible = visible.length > 0 && !loading;

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden p-2" aria-labelledby="search-heading">
            <h1 id="search-heading" className="sr-only">
                Search
            </h1>
            <form onSubmit={submit} className="mb-2 flex shrink-0 flex-wrap items-center gap-2 sm:gap-5">
                <div className="flex w-full max-w-full shrink-0 overflow-x-auto rounded-md bg-muted p-1 sm:w-auto" role="tablist" aria-label="Search tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.type}
                            type="button"
                            role="tab"
                            aria-selected={type === tab.type}
                            onClick={() => {
                                setType(tab.type);
                                setError("");
                            }}
                            className={`h-8 rounded px-4 text-xs font-medium ${type === tab.type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="flex min-w-0 basis-full items-center sm:basis-auto sm:flex-1">
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                        placeholder="Search"
                        maxLength={128}
                        aria-label={`Search ${type}`}
                    />
                    <button type="button" onClick={clearSearch} className="ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search results" title="Clear search results">
                        <Trash2 className="size-4" />
                    </button>
                </div>
            </form>

            {type === "users" ? (
                <div className="mb-3 flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-2 text-xs">
                    <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={searchUserByBio} onChange={(event) => setSearchUserByBio(event.target.checked)} className="accent-primary" />
                        Search by bio
                    </label>
                    <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={searchUserSortByLastLoggedIn} onChange={(event) => setSearchUserSortByLastLoggedIn(event.target.checked)} className="accent-primary" />
                        Sort by last logged in
                    </label>
                </div>
            ) : null}

            {type === "worlds" ? (
                <div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs">
                    <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={searchWorldLabs} onChange={(event) => setSearchWorldLabs(event.target.checked)} className="accent-primary" />
                        Community Labs
                    </label>
                    <select
                        value={worldCategoryIndex}
                        onChange={(event) => {
                            const index = event.target.value;
                            setWorldCategoryIndex(index);
                            const row = worldRows.find((candidate) => String(candidate.index) === index);
                            if (row) void runSearch(0, "worlds", row);
                        }}
                        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label="World category"
                    >
                        <option value="">Category</option>
                        {worldRows.map((row) => (
                            <option key={String(row.index)} value={String(row.index)}>
                                {row.name}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex h-full min-h-64 items-center justify-center">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading search results" />
                    </div>
                ) : null}
                {!loading && !visible.length ? <div className="flex h-full min-h-64 items-center justify-center text-xs text-muted-foreground">No data</div> : null}
                {!loading && type === "users" && visible.length ? <UserResults users={visible as VrchatUser[]} openUser={openUser} /> : null}
                {!loading && type === "worlds" && visible.length ? <WorldResults worlds={visible as VrchatWorld[]} openWorld={openWorld} /> : null}
                {!loading && type === "groups" && visible.length ? <GroupResults groups={visible as VrchatGroup[]} openGroup={openGroup} /> : null}
            </div>

            {paginationVisible ? <SearchPagination previousDisabled={offset === 0} nextDisabled={visible.length < 10} onPrevious={() => void runSearch(Math.max(0, offset - 10))} onNext={() => void runSearch(offset + 10)} /> : null}
        </section>
    );
}

function UserResults({ users, openUser }: { users: VrchatUser[]; openUser: (id: string) => void }) {
    return (
        <div>
            {users.map((user) => {
                const image = friendImage(user);
                return (
                    <button key={user.id} type="button" onClick={() => openUser(user.id)} className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-none px-3 py-2 text-left hover:bg-muted">
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
                            <VrchatImage src={image} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" fallback={<User className="size-5" aria-hidden="true" />} />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex max-w-full items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{user.displayName}</span>
                                <span className="shrink-0 text-xs font-normal text-muted-foreground">{trustLevelFromTags(user.tags)}</span>
                                {languages(user).map((language) => (
                                    <span key={language} className="shrink-0 rounded-sm border border-border px-1 text-[9px] text-muted-foreground" title={language}>
                                        {language}
                                    </span>
                                ))}
                            </span>
                            {user.bio ? <span className="block truncate text-xs text-muted-foreground">{user.bio}</span> : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function WorldResults({ worlds, openWorld }: { worlds: VrchatWorld[]; openWorld: (worldId: string) => void }) {
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {worlds.map((world) => (
                <button key={world.id} type="button" onClick={() => openWorld(world.id)} className="min-w-0 cursor-pointer overflow-hidden rounded-lg border border-border p-3 text-left hover:bg-muted">
                    <div className="aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
                        <VrchatImage src={world.thumbnailImageUrl} alt={world.name} loading="lazy" className="size-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium" title={world.name}>
                        {world.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {world.authorName || "Unknown"}
                        {world.occupants ? ` (${world.occupants})` : ""}
                    </p>
                </button>
            ))}
        </div>
    );
}

function GroupResults({ groups, openGroup }: { groups: VrchatGroup[]; openGroup: (groupId: string) => void }) {
    return (
        <div>
            {groups.map((group) => (
                <button key={group.id} type="button" onClick={() => openGroup(group.id)} className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-none px-3 py-2 text-left hover:bg-muted">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground">
                        <VrchatImage src={group.iconUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" fallback={<Users className="size-5" aria-hidden="true" />} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                            {group.name} <span className="font-normal">({group.memberCount ?? 0})</span>{" "}
                            <span className="font-mono text-xs font-normal text-muted-foreground">
                                {group.shortCode || ""}
                                {group.discriminator ? `.${group.discriminator}` : ""}
                            </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{group.description || ""}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}

function SearchPagination({ previousDisabled, nextDisabled, onPrevious, onNext }: { previousDisabled: boolean; nextDisabled: boolean; onPrevious: () => void; onNext: () => void }) {
    return (
        <div className="flex h-[60px] shrink-0 items-center justify-center">
            <div className="inline-flex overflow-hidden rounded-lg shadow-lg">
                <button type="button" disabled={previousDisabled} onClick={onPrevious} className="inline-flex h-8 items-center gap-1 border border-input bg-background px-3 text-xs disabled:opacity-40" aria-label="Previous search page">
                    <ArrowLeft className="size-4" />
                    <kbd className="rounded border border-border px-1 text-[9px]">Alt</kbd>
                    <kbd className="rounded border border-border px-1 text-[9px]">←</kbd>
                </button>
                <button type="button" disabled={nextDisabled} onClick={onNext} className="inline-flex h-8 items-center gap-1 border border-l-0 border-input bg-background px-3 text-xs disabled:opacity-40" aria-label="Next search page">
                    <kbd className="rounded border border-border px-1 text-[9px]">Alt</kbd>
                    <kbd className="rounded border border-border px-1 text-[9px]">→</kbd>
                    <ArrowRight className="size-4" />
                </button>
            </div>
        </div>
    );
}
