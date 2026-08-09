"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Info, Loader2, MapPin, TrendingDown, TrendingUp, Users, X } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import { type HotWorld, type HotWorldFriend, type HotWorldPeriod, hotWorldFriendsResponseSchema, hotWorldsResponseSchema } from "@/lib/hot-worlds";

const periods: Array<{ days: HotWorldPeriod; label: string }> = [
    { days: 7, label: "Last 7d" },
    { days: 30, label: "Last 30d" },
    { days: 90, label: "Last 90d" },
];

export function HotWorldsView() {
    const { openUser, openWorld } = useFriends();
    const [days, setDays] = useState<HotWorldPeriod>(30);
    const [worlds, setWorlds] = useState<HotWorld[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedWorld, setSelectedWorld] = useState<HotWorld | null>(null);
    const [friends, setFriends] = useState<HotWorldFriend[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const detailTrigger = useRef<HTMLButtonElement | null>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const detailController = useRef<AbortController | null>(null);

    const load = useCallback(async (period: HotWorldPeriod, signal?: AbortSignal) => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/charts/hot-worlds?days=${period}`, { cache: "no-store", signal });
            const payload: unknown = await response.json();
            if (!response.ok) throw new Error(readError(payload, "Hot Worlds could not be loaded."));
            const parsed = hotWorldsResponseSchema.safeParse(payload);
            if (!parsed.success) throw new Error("The Hot Worlds response was not valid.");
            setWorlds(parsed.data.worlds);
        } catch (loadError) {
            if (loadError instanceof DOMException && loadError.name === "AbortError") return;
            setError(loadError instanceof Error ? loadError.message : "Hot Worlds could not be loaded.");
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void load(days, controller.signal);
        return () => controller.abort();
    }, [days, load]);

    const closeDetail = useCallback((restoreFocus = true) => {
        detailController.current?.abort();
        setSelectedWorld(null);
        setFriends([]);
        setDetailError("");
        if (restoreFocus) requestAnimationFrame(() => detailTrigger.current?.focus());
    }, []);

    useEffect(() => {
        if (!selectedWorld) return;
        closeButton.current?.focus();
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            closeDetail();
        }
        window.addEventListener("keydown", closeOnEscape, { capture: true });
        return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
    }, [closeDetail, selectedWorld]);

    async function openDetail(world: HotWorld, trigger: HTMLButtonElement) {
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        detailTrigger.current = trigger;
        setSelectedWorld(world);
        setFriends([]);
        setDetailLoading(true);
        setDetailError("");
        try {
            const response = await fetch(`/api/charts/hot-worlds?days=${days}&worldId=${encodeURIComponent(world.worldId)}`, { cache: "no-store", signal: controller.signal });
            const payload: unknown = await response.json();
            if (!response.ok) throw new Error(readError(payload, "Friend visit details could not be loaded."));
            const parsed = hotWorldFriendsResponseSchema.safeParse(payload);
            if (!parsed.success) throw new Error("The friend visit response was not valid.");
            setFriends(parsed.data.friends);
        } catch (detailLoadError) {
            if (detailLoadError instanceof DOMException && detailLoadError.name === "AbortError") return;
            setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "Friend visit details could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setDetailLoading(false);
        }
    }

    function changeDays(period: HotWorldPeriod) {
        closeDetail(false);
        setDays(period);
    }

    const displayed = worlds.slice(0, 20);
    const midpoint = Math.ceil(displayed.length / 2);
    const columns = [displayed.slice(0, midpoint), displayed.slice(midpoint)];
    const maxFriends = displayed[0]?.uniqueFriends || 1;
    const stats = useMemo(
        () => ({
            visits: displayed.reduce((sum, world) => sum + world.visitCount, 0),
            rising: displayed.filter((world) => world.trend === "rising").length,
            cooling: displayed.filter((world) => world.trend === "cooling").length,
        }),
        [displayed],
    );

    return (
        <section id="chart" className="h-full min-h-0 overflow-y-auto p-4" aria-labelledby="hot-worlds-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h1 id="hot-worlds-heading" className="text-sm font-medium">
                        Hot Worlds
                    </h1>
                    <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                        aria-label="About Hot Worlds"
                        title="Shows worlds your friends visited through remotely observed GPS changes. Trend compares the first and second portions of the selected period."
                    >
                        <Info className="size-3.5" />
                    </button>
                </div>
                <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="Hot Worlds period">
                    {periods.map((period) => (
                        <button key={period.days} type="button" onClick={() => changeDays(period.days)} aria-pressed={days === period.days} className={`h-8 rounded px-3 text-xs ${days === period.days ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}>
                            {period.label}
                        </button>
                    ))}
                </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Remote friend GPS observations only · private and unobserved visits are unavailable</p>

            {loading ? (
                <div className="flex min-h-80 items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading Hot Worlds" />
                </div>
            ) : null}
            {!loading && error ? (
                <div className="mx-auto mt-24 max-w-lg rounded-md border border-destructive/40 bg-destructive/10 p-3 text-center text-xs text-destructive">
                    <p>{error}</p>
                    <button type="button" onClick={() => void load(days)} className="mt-2 h-8 rounded border border-destructive/40 px-3">
                        Retry
                    </button>
                </div>
            ) : null}
            {!loading && !error && !displayed.length ? <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">No remotely observed friend visits.</div> : null}

            {!loading && !error && displayed.length ? (
                <>
                    <div className="mx-auto mt-5 flex max-w-[1100px] flex-wrap items-center gap-3">
                        <Stat icon={<MapPin className="size-3.5 text-muted-foreground" />} value={stats.visits} label="total visits" />
                        {stats.rising ? <Stat icon={<TrendingUp className="size-3.5 text-green-500/60" />} value={stats.rising} label="rising" /> : null}
                        {stats.cooling ? <Stat icon={<TrendingDown className="size-3.5 text-blue-400/60" />} value={stats.cooling} label="cooling" /> : null}
                        <span className="ml-auto text-xs text-muted-foreground/60">Sorted by unique friends</span>
                    </div>

                    <div className="mx-auto mt-3 max-w-[1100px] md:hidden">
                        {displayed.map((world, index) => (
                            <WorldRankRow key={world.worldId} world={world} rank={index + 1} maxFriends={maxFriends} openDetail={openDetail} openWorld={openWorld} />
                        ))}
                    </div>
                    <div className="mx-auto mt-3 hidden max-w-[1100px] gap-x-6 md:flex">
                        {columns.map((column, columnIndex) => (
                            <div key={columnIndex === 0 ? "first" : "second"} className="min-w-0 flex-1">
                                {column.map((world, index) => (
                                    <WorldRankRow key={world.worldId} world={world} rank={columnIndex * midpoint + index + 1} maxFriends={maxFriends} openDetail={openDetail} openWorld={openWorld} />
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            {selectedWorld ? (
                <HotWorldDetail
                    world={selectedWorld}
                    friends={friends}
                    loading={detailLoading}
                    error={detailError}
                    closeButton={closeButton}
                    close={() => closeDetail()}
                    openWorld={() => {
                        closeDetail(false);
                        openWorld(selectedWorld.worldId);
                    }}
                    openUser={(userId) => {
                        closeDetail(false);
                        openUser(userId);
                    }}
                />
            ) : null}
        </section>
    );
}

function WorldRankRow({ world, rank, maxFriends, openDetail, openWorld }: { world: HotWorld; rank: number; maxFriends: number; openDetail: (world: HotWorld, trigger: HTMLButtonElement) => Promise<void>; openWorld: (worldId: string) => void }) {
    return (
        <div className={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent ${rank === 1 ? "bg-primary/[0.04]" : ""}`}>
            <button type="button" onClick={(event) => void openDetail(world, event.currentTarget)} className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Show visit details for ${world.worldName}`} />
            <span className={`relative mt-0.5 w-6 shrink-0 text-right font-mono text-sm font-bold ${rank === 1 ? "text-primary" : "text-muted-foreground"}`}>#{rank}</span>
            <div className="relative min-w-0 flex-1 pointer-events-none">
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => openWorld(world.worldId)} className="pointer-events-auto relative z-10 block max-w-[380px] truncate text-sm font-medium hover:underline">
                        {world.worldName}
                    </button>
                    {world.trend === "rising" ? <TrendingUp className="size-3 shrink-0 text-green-500/60" /> : null}
                    {world.trend === "cooling" ? <TrendingDown className="size-3 shrink-0 text-blue-400/60" /> : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                    {world.uniqueFriends} {world.uniqueFriends === 1 ? "friend" : "friends"} <span className="text-muted-foreground/60">({world.visitCount} visits)</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                    <div className="h-full rounded-full bg-foreground/35 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${Math.max(4, (world.uniqueFriends / maxFriends) * 100)}%` }} />
                </div>
            </div>
        </div>
    );
}

function HotWorldDetail({ world, friends, loading, error, closeButton, close, openWorld, openUser }: { world: HotWorld; friends: HotWorldFriend[]; loading: boolean; error: string; closeButton: React.RefObject<HTMLButtonElement | null>; close: () => void; openWorld: () => void; openUser: (userId: string) => void }) {
    return (
        <div className="fixed inset-0 z-[90]" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/50" onClick={close} aria-label="Close Hot Worlds details" />
            <aside role="dialog" aria-modal="true" aria-labelledby="hot-world-detail-title" className="absolute inset-y-0 right-0 flex w-full max-w-[340px] flex-col border-l border-border bg-background shadow-2xl">
                <header className="flex items-start gap-2 border-b border-border px-5 py-4">
                    <button id="hot-world-detail-title" type="button" onClick={openWorld} className="min-w-0 flex-1 truncate text-left text-base font-semibold hover:underline">
                        {world.worldName}
                    </button>
                    <button ref={closeButton} type="button" onClick={close} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge icon={<Users className="size-3" />}>{world.uniqueFriends} friends</Badge>
                        <Badge icon={<MapPin className="size-3" />}>{world.visitCount} visits</Badge>
                        {world.trend === "rising" ? <Badge icon={<TrendingUp className="size-3" />}>Rising</Badge> : null}
                        {world.trend === "cooling" ? <Badge icon={<TrendingDown className="size-3" />}>Cooling</Badge> : null}
                    </div>
                    <div className="my-4 border-t border-border" />
                    <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Friends who visited</h2>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : null}
                    {!loading && error ? <p className="py-6 text-center text-xs text-destructive">{error}</p> : null}
                    {!loading && !error && !friends.length ? <p className="py-6 text-center text-xs text-muted-foreground">No friend visit data</p> : null}
                    {!loading && !error ? (
                        <div className="space-y-0.5">
                            {friends.map((friend) => (
                                <button key={friend.userId} type="button" onClick={() => openUser(friend.userId)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent">
                                    <span className="min-w-0 flex-1 truncate">{friend.displayName}</span>
                                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{friend.visitCount}×</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            </aside>
        </div>
    );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            {icon}
            <span className="text-sm font-medium tabular-nums">{value.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    );
}

function Badge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {icon}
            {children}
        </span>
    );
}

function readError(payload: unknown, fallback: string) {
    return typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}
