"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CalendarRange, ChevronRight, Clock3, MapPin, Search, X } from "lucide-react";

import type { GameSessionDto, GameSessionsResponse } from "@/lib/game-log/types";

function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

function formatDuration(session: GameSessionDto) {
    if (!session.endedAt) return "";
    const seconds = Math.max(0, Math.floor((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${remainder}s`;
    return `${remainder}s`;
}

function SessionSegment({ session, latest }: { session: GameSessionDto; latest: boolean }) {
    const [collapsed, setCollapsed] = useState(false);
    const duration = formatDuration(session);
    return (
        <section className="border-b border-border last:border-b-0">
            <button
                type="button"
                className="sticky top-0 z-[5] flex w-full cursor-pointer flex-wrap items-center gap-2 border-none border-b border-border bg-muted/80 px-3 py-2 text-left backdrop-blur-sm transition-colors hover:bg-muted sm:flex-nowrap"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={!collapsed}
            >
                <ChevronRight aria-hidden="true" className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`} />
                <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm sm:flex-none">{session.worldName || session.worldId || session.location}</span>
                {session.groupName ? <span className="min-w-0 truncate text-xs text-muted-foreground max-sm:hidden">({session.groupName})</span> : null}
                <span className="shrink-0 text-[0.6875rem] text-muted-foreground max-sm:hidden">{formatDate(session.startedAt)}</span>
                {duration ? <span className="h-4 rounded border border-border px-1 font-mono text-[0.625rem] leading-[0.875rem]">{duration}</span> : null}
                {!duration && latest && session.current ? (
                    <span className="h-4 rounded border border-border px-1 text-[0.625rem] leading-[0.875rem]">
                        <span className="sm:hidden">Current</span>
                        <span className="max-sm:hidden">Current session</span>
                    </span>
                ) : null}
                <span className="flex w-full min-w-0 items-center gap-2 pl-[3.75rem] text-[0.6875rem] text-muted-foreground sm:hidden">
                    {session.groupName ? <span className="min-w-0 truncate">({session.groupName})</span> : null}
                    <span className="ml-auto shrink-0">{formatDate(session.startedAt)}</span>
                </span>
            </button>
            {!collapsed ? (
                <div className="grid gap-1 px-8 py-2 text-[0.75rem] text-muted-foreground lg:grid-cols-2">
                    <span className="truncate" title={session.location}>
                        {session.location}
                    </span>
                    <span className="flex items-center gap-1 sm:justify-end">
                        <Clock3 aria-hidden="true" className="size-3" />
                        Last observed {formatDate(session.lastObservedAt)}
                    </span>
                </div>
            ) : null}
        </section>
    );
}

function SessionsSkeleton() {
    return (
        <div className="flex flex-col gap-4 p-4" aria-label="Loading Game Log sessions">
            {[0, 1, 2].map((item) => (
                <div key={item} className="space-y-2">
                    <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                </div>
            ))}
        </div>
    );
}

export function GameLogView() {
    const [sessions, setSessions] = useState<GameSessionDto[]>([]);
    const [nextCursor, setNextCursor] = useState<string>();
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [dateOpen, setDateOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const sentinelRef = useRef<HTMLDivElement>(null);

    const load = useCallback(
        async (cursor?: string) => {
            cursor ? setLoadingMore(true) : setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams({ limit: "30" });
                if (cursor) params.set("cursor", cursor);
                if (search.trim()) params.set("search", search.trim());
                if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
                if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
                const response = await fetch(`/api/game-log/sessions?${params}`, { cache: "no-store" });
                const payload = (await response.json()) as GameSessionsResponse & { error?: string };
                if (response.status === 401) {
                    window.location.assign("/login");
                    return;
                }
                if (!response.ok) throw new Error(payload.error || "Game Log sessions could not be loaded.");
                setSessions((current) => (cursor ? [...current, ...payload.sessions] : payload.sessions));
                setNextCursor(payload.nextCursor);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Game Log sessions could not be loaded.");
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [from, search, to],
    );

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !nextCursor) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting) && !loadingMore) void load(nextCursor);
            },
            { rootMargin: "200px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [load, loadingMore, nextCursor]);

    return (
        <div className="flex h-full flex-col overflow-hidden p-2">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-0 pb-4">
                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setDateOpen((value) => !value)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 hover:bg-accent ${from || to ? "bg-accent text-accent-foreground" : "bg-background"}`}
                        aria-label="Filter sessions by date"
                        aria-expanded={dateOpen}
                    >
                        <CalendarRange aria-hidden="true" className="size-4" />
                        {from || to ? <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-1 text-xs">1</span> : null}
                    </button>
                    {dateOpen ? (
                        <div className="absolute top-10 left-0 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-3 shadow-lg">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                    From
                                    <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-foreground" max={to || new Date().toISOString().slice(0, 10)} />
                                </label>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                    To
                                    <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-foreground" min={from || undefined} max={new Date().toISOString().slice(0, 10)} />
                                </label>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent"
                                    onClick={() => {
                                        setFrom("");
                                        setTo("");
                                        setDateOpen(false);
                                    }}
                                >
                                    Clear
                                </button>
                                <button type="button" className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:opacity-90" onClick={() => setDateOpen(false)}>
                                    Confirm
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
                <label className="relative ml-auto w-60 shrink-0 max-sm:w-full">
                    <Search aria-hidden="true" className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Game Log" className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm" />
                    {search ? (
                        <button type="button" onClick={() => setSearch("")} className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent" aria-label="Clear Game Log search">
                            <X className="size-3.5" />
                        </button>
                    ) : null}
                </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? <SessionsSkeleton /> : null}
                {!loading && error ? <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
                {!loading && !error && sessions.length === 0 ? <div className="m-4 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No data</div> : null}
                {!loading && !error ? sessions.map((session, index) => <SessionSegment key={session.id} session={session} latest={index === 0} />) : null}
                <div ref={sentinelRef} className="flex items-center justify-center py-4 pb-6 text-[0.8125rem] text-muted-foreground">
                    {loadingMore ? "Load more..." : sessions.length && !nextCursor ? "No more" : null}
                </div>
            </div>
        </div>
    );
}
