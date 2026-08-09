"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowDown, ArrowRight, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ListFilter, Loader2, Search, Star, Trash2, UserMinus } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import { VrchatImage } from "@/components/vrchat-image";
import type { ActivityType, FriendActivity } from "@/lib/activity-log";

type ActivityMode = "feed" | "friend-log";
type FeedType = Extract<ActivityType, "GPS" | "Online" | "Offline" | "Status" | "Avatar" | "Bio">;
type FriendLogType = Extract<ActivityType, "Friend" | "Unfriend" | "FriendRequest" | "DisplayName" | "TrustLevel">;
type PageSize = 20 | 50 | 100;

const feedTypes: FeedType[] = ["GPS", "Online", "Offline", "Status", "Avatar", "Bio"];
const friendLogTypes: FriendLogType[] = ["Friend", "Unfriend", "FriendRequest", "DisplayName", "TrustLevel"];

type ActivitySettings = {
    feedFilters: FeedType[];
    feedFavoritesOnly: boolean;
    friendLogFilters: FriendLogType[];
    activityTablePageSize: PageSize;
};

const defaultSettings: ActivitySettings = { feedFilters: [], feedFavoritesOnly: false, friendLogFilters: [], activityTablePageSize: 20 };

function formatDate(value: string, long = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en", long ? { dateStyle: "long", timeStyle: "medium" } : { dateStyle: "short", timeStyle: "short" }).format(date);
}

function splitStatus(value?: string) {
    const [status = "", ...description] = (value || "").split("\n");
    return { status, description: description.join("\n") };
}

function conciseValue(value?: string) {
    if (!value) return "None";
    if (/^https?:\/\//i.test(value)) return "Avatar image";
    return value.replaceAll("\n", " · ");
}

function feedDetail(entry: FriendActivity) {
    if (entry.type === "GPS") return `Moved to ${conciseValue(entry.current)}`;
    if (entry.type === "Online") return entry.current ? `Online at ${entry.current}` : "Came online";
    if (entry.type === "Offline") return entry.previous ? `Offline from ${entry.previous}` : "Went offline";
    if (entry.type === "Status") return splitStatus(entry.current).description || splitStatus(entry.current).status || "Status changed";
    if (entry.type === "Avatar") return "Avatar changed";
    return "Bio changed";
}

function patchSettings(patch: Partial<ActivitySettings>) {
    void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
}

export function ActivityView({ mode }: { mode: ActivityMode }) {
    const { openUser } = useFriends();
    const [entries, setEntries] = useState<FriendActivity[]>([]);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [settings, setSettings] = useState<ActivitySettings>(defaultSettings);
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [dateDraft, setDateDraft] = useState({ from: "", to: "" });
    const [dateOpen, setDateOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(0);
    const [ascending, setAscending] = useState(false);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        const response = await fetch("/api/activity?limit=2000", { cache: "no-store" });
        const payload = (await response.json()) as { entries?: FriendActivity[] };
        if (response.status === 401) {
            window.location.assign("/login");
            return;
        }
        if (response.ok && payload.entries) setEntries(payload.entries);
        setLoading(false);
    }, []);

    useEffect(() => {
        void Promise.all([
            reload(),
            fetch("/api/settings", { cache: "no-store" })
                .then((response) => response.json())
                .then((payload: Partial<ActivitySettings>) => setSettings({ ...defaultSettings, ...payload })),
            fetch("/api/favorites?section=records", { cache: "no-store" })
                .then((response) => response.json())
                .then((payload: { favorites?: Array<{ favoriteId?: string; type?: string }> }) => setFavoriteIds(new Set((payload.favorites || []).filter((favorite) => favorite.type === "friend" && favorite.favoriteId).map((favorite) => favorite.favoriteId as string)))),
        ]);
        const interval = window.setInterval(() => void reload(), 30_000);
        return () => window.clearInterval(interval);
    }, [reload]);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const selected = mode === "feed" ? settings.feedFilters : settings.friendLogFilters;
        const allowed = mode === "feed" ? feedTypes : friendLogTypes;
        const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
        return entries
            .filter((entry) => {
                if (!(allowed as ActivityType[]).includes(entry.type)) return false;
                if (selected.length && !(selected as ActivityType[]).includes(entry.type)) return false;
                if (mode === "feed" && settings.feedFavoritesOnly && !favoriteIds.has(entry.userId)) return false;
                const time = Date.parse(entry.createdAt);
                if (mode === "feed" && (time < from || time > to)) return false;
                return !query || `${entry.displayName} ${entry.userId} ${entry.type} ${entry.previous || ""} ${entry.current || ""}`.toLocaleLowerCase().includes(query);
            })
            .sort((left, right) => (ascending ? 1 : -1) * (Date.parse(left.createdAt) - Date.parse(right.createdAt)));
    }, [ascending, dateFrom, dateTo, entries, favoriteIds, mode, search, settings]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / settings.activityTablePageSize));
    const safePage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(safePage * settings.activityTablePageSize, (safePage + 1) * settings.activityTablePageSize);

    function updateSettings(patch: Partial<ActivitySettings>) {
        setSettings((current) => ({ ...current, ...patch }));
        patchSettings(patch);
    }

    function toggleFeedType(type: FeedType | "All") {
        if (type === "All") return updateSettings({ feedFilters: [] });
        const current = settings.feedFilters;
        const next = current.includes(type) ? current.filter((value) => value !== type) : [...current, type];
        updateSettings({ feedFilters: next.length === feedTypes.length ? [] : next });
    }

    function toggleFriendLogType(type: FriendLogType) {
        const current = settings.friendLogFilters;
        updateSettings({ friendLogFilters: current.includes(type) ? current.filter((value) => value !== type) : [...current, type] });
    }

    async function removeEntry(entry: FriendActivity, bypassConfirmation: boolean) {
        if (!bypassConfirmation && !window.confirm("Delete this log entry?")) return;
        const response = await fetch("/api/activity", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id }) });
        if (response.ok) setEntries((current) => current.filter((item) => item.id !== entry.id));
    }

    function applyDateFilter() {
        setDateFrom(dateDraft.from);
        setDateTo(dateDraft.to);
        setDateOpen(false);
    }

    const title = mode === "feed" ? "Feed" : "Friend Log";
    return (
        <section className="flex h-full min-h-0 flex-col p-2" aria-labelledby="activity-heading">
            <h1 id="activity-heading" className="sr-only">
                {title}
            </h1>
            {mode === "feed" ? (
                <FeedToolbar
                    filters={settings.feedFilters}
                    favoritesOnly={settings.feedFavoritesOnly}
                    search={search}
                    dateOpen={dateOpen}
                    dateDraft={dateDraft}
                    dateActive={Boolean(dateFrom || dateTo)}
                    setSearch={setSearch}
                    setDateOpen={setDateOpen}
                    setDateDraft={setDateDraft}
                    applyDateFilter={applyDateFilter}
                    clearDateFilter={() => {
                        setDateDraft({ from: "", to: "" });
                        setDateFrom("");
                        setDateTo("");
                        setDateOpen(false);
                    }}
                    toggleType={toggleFeedType}
                    toggleFavorites={() => updateSettings({ feedFavoritesOnly: !settings.feedFavoritesOnly })}
                />
            ) : (
                <FriendLogToolbar filters={settings.friendLogFilters} search={search} setSearch={setSearch} toggleType={toggleFriendLogType} />
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" aria-label="Loading activity" />
                    </div>
                ) : visible.length ? (
                    mode === "feed" ? (
                        <FeedTable entries={visible} expanded={expanded} setExpanded={setExpanded} ascending={ascending} toggleSort={() => setAscending((value) => !value)} openUser={openUser} />
                    ) : (
                        <FriendLogTable entries={visible} ascending={ascending} toggleSort={() => setAscending((value) => !value)} openUser={openUser} removeEntry={removeEntry} />
                    )
                ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
                        <UserMinus className="size-8" aria-hidden="true" />
                        <p className="text-sm">No matching events.</p>
                        <p className="max-w-md text-xs">Events appear as the server continuously observes changes through the VRChat APIs.</p>
                    </div>
                )}
            </div>

            <Pagination count={filtered.length} page={safePage} pageCount={pageCount} pageSize={settings.activityTablePageSize} setPage={setPage} setPageSize={(activityTablePageSize) => updateSettings({ activityTablePageSize })} />
        </section>
    );
}

type FeedToolbarProps = {
    filters: FeedType[];
    favoritesOnly: boolean;
    search: string;
    dateOpen: boolean;
    dateDraft: { from: string; to: string };
    dateActive: boolean;
    setSearch: (value: string) => void;
    setDateOpen: (value: boolean) => void;
    setDateDraft: (value: { from: string; to: string }) => void;
    applyDateFilter: () => void;
    clearDateFilter: () => void;
    toggleType: (type: FeedType | "All") => void;
    toggleFavorites: () => void;
};

function FeedToolbar(props: FeedToolbarProps) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => props.setDateOpen(!props.dateOpen)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs hover:bg-muted" aria-expanded={props.dateOpen}>
                    <ListFilter className="size-4" aria-hidden="true" /> Filter
                    {props.dateActive ? <span className="inline-flex size-4 items-center justify-center rounded-full bg-secondary text-[10px]">1</span> : null}
                </button>
                {props.dateOpen ? (
                    <div className="absolute top-10 left-0 z-30 w-72 rounded-md border border-border bg-popover p-3 shadow-xl">
                        <label className="mb-3 block text-xs text-muted-foreground">
                            From
                            <input type="date" value={props.dateDraft.from} onChange={(event) => props.setDateDraft({ ...props.dateDraft, from: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs" />
                        </label>
                        <label className="block text-xs text-muted-foreground">
                            To
                            <input type="date" value={props.dateDraft.to} onChange={(event) => props.setDateDraft({ ...props.dateDraft, to: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs" />
                        </label>
                        <div className="mt-3 flex justify-end gap-2">
                            <button type="button" onClick={props.clearDateFilter} className="h-8 rounded-md border border-input px-3 text-xs">
                                Clear
                            </button>
                            <button type="button" onClick={props.applyDateFilter} className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground">
                                Confirm
                            </button>
                        </div>
                    </div>
                ) : null}
                <button
                    type="button"
                    onClick={props.toggleFavorites}
                    className={`inline-flex size-8 items-center justify-center rounded-md border border-input hover:bg-muted ${props.favoritesOnly ? "text-yellow-400" : "text-muted-foreground"}`}
                    aria-label="Favorites only"
                    aria-pressed={props.favoritesOnly}
                    title="Favorites only"
                >
                    <Star className="size-4" fill={props.favoritesOnly ? "currentColor" : "none"} aria-hidden="true" />
                </button>
            </div>
            <div className="flex min-w-0 flex-1 overflow-x-auto rounded-md [scrollbar-width:thin]" role="group" aria-label="Feed types">
                {(["All", ...feedTypes] as const).map((type) => {
                    const selected = type === "All" ? props.filters.length === 0 : props.filters.includes(type);
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => props.toggleType(type)}
                            aria-pressed={selected}
                            className={`h-8 shrink-0 border border-input px-3 text-xs first:rounded-l-md last:rounded-r-md [&+&]:border-l-0 ${selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                            {type}
                        </button>
                    );
                })}
            </div>
            <SearchField value={props.search} setValue={props.setSearch} placeholder="Search feed" />
        </div>
    );
}

function FriendLogToolbar({ filters, search, setSearch, toggleType }: { filters: FriendLogType[]; search: string; setSearch: (value: string) => void; toggleType: (type: FriendLogType) => void }) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-2">
            <details className="relative min-w-52 flex-1">
                <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-input px-3 text-xs [&::-webkit-details-marker]:hidden">
                    <span className="truncate text-muted-foreground">{filters.length ? filters.join(", ") : "Filter log types"}</span>
                    <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                </summary>
                <div className="absolute top-10 left-0 z-30 w-full min-w-56 rounded-md border border-border bg-popover p-1 shadow-xl">
                    {friendLogTypes.map((type) => (
                        <label key={type} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted">
                            <input type="checkbox" checked={filters.includes(type)} onChange={() => toggleType(type)} className="accent-primary" />
                            {type}
                        </label>
                    ))}
                </div>
            </details>
            <SearchField value={search} setValue={setSearch} placeholder="Search friend log" />
        </div>
    );
}

function SearchField({ value, setValue, placeholder }: { value: string; setValue: (value: string) => void; placeholder: string }) {
    return (
        <label className="relative w-full min-w-48 flex-none sm:w-auto sm:max-w-sm sm:flex-[0.4]">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={value} onChange={(event) => setValue(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-xs outline-none focus:border-ring" placeholder={placeholder} />
        </label>
    );
}

function DateHeader({ ascending, toggleSort }: { ascending: boolean; toggleSort: () => void }) {
    return (
        <button type="button" onClick={toggleSort} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={`Sort date ${ascending ? "descending" : "ascending"}`}>
            Date <ArrowUpDown className="size-3.5" aria-hidden="true" />
        </button>
    );
}

function FeedTable({ entries, expanded, setExpanded, ascending, toggleSort, openUser }: { entries: FriendActivity[]; expanded: Set<string>; setExpanded: (value: Set<string>) => void; ascending: boolean; toggleSort: () => void; openUser: (id: string) => void }) {
    function toggle(id: string) {
        const next = new Set(expanded);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpanded(next);
    }
    return (
        <table className="w-full min-w-[680px] table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="w-40 px-2 py-2">
                        <DateHeader ascending={ascending} toggleSort={toggleSort} />
                    </th>
                    <th className="w-32 px-2 py-2">Type</th>
                    <th className="w-52 px-2 py-2">User</th>
                    <th className="px-2 py-2">Detail</th>
                </tr>
            </thead>
            <tbody>
                {entries.map((entry) => {
                    const isExpanded = expanded.has(entry.id);
                    return <FragmentRow key={entry.id} entry={entry} expanded={isExpanded} toggle={() => toggle(entry.id)} openUser={openUser} />;
                })}
            </tbody>
        </table>
    );
}

function FragmentRow({ entry, expanded, toggle, openUser }: { entry: FriendActivity; expanded: boolean; toggle: () => void; openUser: (id: string) => void }) {
    return (
        <>
            <tr className="hover:bg-muted/50">
                <td className="border-t border-border px-2 py-2">
                    <button type="button" onClick={toggle} className="inline-flex size-6 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.type} event`}>
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                </td>
                <td className="whitespace-nowrap border-t border-border px-2 py-2 text-muted-foreground" title={formatDate(entry.createdAt, true)}>
                    {formatDate(entry.createdAt)}
                </td>
                <td className="border-t border-border px-2 py-2">
                    <TypeBadge type={entry.type} />
                </td>
                <td className="truncate border-t border-border px-2 py-2">
                    <button type="button" onClick={() => openUser(entry.userId)} className="max-w-full truncate hover:text-primary">
                        {entry.displayName}
                    </button>
                </td>
                <td className="truncate border-t border-border px-2 py-2 text-muted-foreground">{feedDetail(entry)}</td>
            </tr>
            {expanded ? (
                <tr>
                    <td className="border-t border-border bg-muted/25" />
                    <td colSpan={4} className="border-t border-border bg-muted/25 px-3 py-3">
                        <ExpandedFeedDetail entry={entry} />
                    </td>
                </tr>
            ) : null}
        </>
    );
}

function ExpandedFeedDetail({ entry }: { entry: FriendActivity }) {
    if (entry.type === "GPS") {
        return <ChangeDetail previous={entry.previous} current={entry.current} vertical />;
    }
    if (entry.type === "Online") return <ValuePill value={entry.current || "Location unavailable"} />;
    if (entry.type === "Offline") return <ValuePill value={entry.previous || "Location unavailable"} />;
    if (entry.type === "Status") {
        const previous = splitStatus(entry.previous);
        const current = splitStatus(entry.current);
        return <ChangeDetail previous={`${previous.status}${previous.description ? ` — ${previous.description}` : ""}`} current={`${current.status}${current.description ? ` — ${current.description}` : ""}`} />;
    }
    if (entry.type === "Avatar") return <AvatarChange previous={entry.previous} current={entry.current} />;
    if (entry.type === "Bio") return <ChangeDetail previous={entry.previous} current={entry.current} />;
    return null;
}

function ChangeDetail({ previous, current, vertical = false }: { previous?: string; current?: string; vertical?: boolean }) {
    return (
        <div className={`flex min-w-0 text-xs ${vertical ? "flex-col items-start gap-1" : "items-center gap-2"}`}>
            <ValuePill value={previous || "None"} removed />
            {vertical ? <ArrowDown className="ml-2 size-4 text-muted-foreground" /> : <ArrowRight className="size-4 shrink-0 text-muted-foreground" />}
            <ValuePill value={current || "None"} added />
        </div>
    );
}

function ValuePill({ value, removed, added }: { value: string; removed?: boolean; added?: boolean }) {
    return <span className={`max-w-full whitespace-pre-wrap break-words rounded px-1 py-0.5 ${removed ? "bg-red-500/15 text-red-400 line-through" : added ? "bg-green-500/15 text-green-400" : "text-muted-foreground"}`}>{value}</span>;
}

function AvatarChange({ previous, current }: { previous?: string; current?: string }) {
    return (
        <div className="flex items-center gap-2">
            <AvatarPreview url={previous} label="Previous avatar" />
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <AvatarPreview url={current} label="Current avatar" />
        </div>
    );
}

function AvatarPreview({ url, label }: { url?: string; label: string }) {
    if (!url) return <div className="flex h-24 w-32 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">None</div>;
    return <VrchatImage src={url} alt={label} loading="lazy" className="h-24 w-32 rounded object-cover" fallback={<div className="flex h-24 w-32 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">Unavailable</div>} />;
}

function FriendLogTable({ entries, ascending, toggleSort, openUser, removeEntry }: { entries: FriendActivity[]; ascending: boolean; toggleSort: () => void; openUser: (id: string) => void; removeEntry: (entry: FriendActivity, bypassConfirmation: boolean) => Promise<void> }) {
    return (
        <table className="w-full min-w-[580px] table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                <tr>
                    <th className="w-5" />
                    <th className="w-40 px-2 py-2">
                        <DateHeader ascending={ascending} toggleSort={toggleSort} />
                    </th>
                    <th className="w-40 px-2 py-2">Type</th>
                    <th className="px-2 py-2">User</th>
                    <th className="w-20 px-2 py-2 text-right">Action</th>
                </tr>
            </thead>
            <tbody>
                {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/50">
                        <td className="border-t border-border" />
                        <td className="whitespace-nowrap border-t border-border px-2 py-2 text-muted-foreground" title={formatDate(entry.createdAt, true)}>
                            {formatDate(entry.createdAt)}
                        </td>
                        <td className="border-t border-border px-2 py-2">
                            <TypeBadge type={entry.type} />
                        </td>
                        <td className="border-t border-border px-2 py-2">
                            <FriendLogUser entry={entry} openUser={openUser} />
                        </td>
                        <td className="border-t border-border px-2 py-2 text-right">
                            <button type="button" onClick={(event) => void removeEntry(entry, event.shiftKey)} className="inline-flex size-7 items-center justify-center text-muted-foreground hover:text-destructive" aria-label="Delete log entry" title="Delete log entry (hold Shift to skip confirmation)">
                                <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function FriendLogUser({ entry, openUser }: { entry: FriendActivity; openUser: (id: string) => void }) {
    return (
        <span className="block min-w-0 break-words">
            {entry.type === "DisplayName" && entry.previous ? (
                <span className="mr-1 text-muted-foreground">
                    {entry.previous}
                    <ArrowRight className="mx-1 inline size-3" aria-hidden="true" />
                </span>
            ) : null}
            <button type="button" onClick={() => openUser(entry.userId)} className="hover:text-primary">
                {entry.displayName || entry.userId}
            </button>
            {entry.type === "TrustLevel" ? (
                <span className="ml-1 text-muted-foreground">
                    ({entry.previous || "Visitor"}
                    <ArrowRight className="mx-1 inline size-3" aria-hidden="true" />
                    {entry.current || "Visitor"})
                </span>
            ) : null}
        </span>
    );
}

function TypeBadge({ type }: { type: ActivityType }) {
    return <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{type}</span>;
}

function Pagination({ count, page, pageCount, pageSize, setPage, setPageSize }: { count: number; page: number; pageCount: number; pageSize: PageSize; setPage: (page: number) => void; setPageSize: (size: PageSize) => void }) {
    return (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
            <span>
                {count} item{count === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-1">
                    Rows
                    <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as PageSize)} className="h-7 rounded border border-input bg-background px-1 text-[10px]">
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </label>
                <span>
                    {page + 1} / {pageCount}
                </span>
                <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Previous page">
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page + 1 >= pageCount} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Next page">
                    <ChevronRight className="size-4" />
                </button>
            </div>
        </div>
    );
}
