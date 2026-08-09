"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EyeOff, Loader2, RefreshCw, Settings, Square, User, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import { VrchatSvgImage } from "@/components/vrchat-image";
import { safeVrchatMediaUrl } from "@/lib/browser-url";
import { buildMutualEdges, countMutualDegrees, type MutualEdge, type MutualGraphSnapshot } from "@/lib/mutual-graph";
import { cancelMutualGraphFetch, fetchAndPersistMutualGraph, refreshMutualGraphFriend } from "@/lib/mutual-graph-client";
import type { VrchatUser } from "@/lib/vrchat/types";

type GraphJob = { status: "cancelled" | "complete" | "error" | "running"; processed: number; total: number; error?: string };
type LayoutSettings = { iterations: number; spacing: number; curvature: number; separation: number; excluded: string[] };
type Position = { x: number; y: number };

const defaults: LayoutSettings = { iterations: 800, spacing: 60, curvature: 0.1, separation: 0, excluded: [] };
const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

export function MutualFriendsView() {
    const currentUser = useCurrentUser();
    const { allFriends, openUser } = useFriends();
    const [snapshot, setSnapshot] = useState<MutualGraphSnapshot | null>(null);
    const [fetching, setFetching] = useState(false);
    const [processed, setProcessed] = useState(0);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState("");
    const [selectedFriendId, setSelectedFriendId] = useState("");
    const [settings, setSettings] = useState<LayoutSettings>(defaults);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [nodeMenu, setNodeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const friendsRef = useRef(allFriends);

    useEffect(() => {
        friendsRef.current = allFriends;
    }, [allFriends]);

    const followJob = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setFetching(true);
        setError("");
        try {
            const result = await fetchAndPersistMutualGraph(friendsRef.current, controller.signal, setProcessed);
            setSnapshot(result.snapshot);
            const response = await fetch("/api/mutual-graph", { cache: "no-store" });
            const payload = (await response.json()) as { job?: GraphJob };
            setTotal(payload.job?.total || friendsRef.current.length);
        } catch (fetchError) {
            if (fetchError && typeof fetchError === "object" && "status" in fetchError && fetchError.status === 401) window.location.assign("/login");
            if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) setError(fetchError instanceof Error ? fetchError.message : "The mutual graph could not be loaded.");
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void Promise.all([
            fetch("/api/mutual-graph", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { snapshot?: MutualGraphSnapshot | null; job?: GraphJob }) => {
                    setSnapshot(payload.snapshot || null);
                    setProcessed(payload.job?.processed || 0);
                    setTotal(payload.job?.total || 0);
                    if (payload.job?.status === "running") void followJob();
                    if (payload.job?.status === "error") setError(payload.job.error || "The mutual graph job failed.");
                }),
            fetch("/api/settings", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((value: { mutualGraphLayoutIterations?: number; mutualGraphLayoutSpacing?: number; mutualGraphEdgeCurvature?: number; mutualGraphCommunitySeparation?: number; mutualGraphExcludedFriendIds?: string[] }) =>
                    setSettings({
                        iterations: value.mutualGraphLayoutIterations ?? defaults.iterations,
                        spacing: value.mutualGraphLayoutSpacing ?? defaults.spacing,
                        curvature: value.mutualGraphEdgeCurvature ?? defaults.curvature,
                        separation: value.mutualGraphCommunitySeparation ?? defaults.separation,
                        excluded: value.mutualGraphExcludedFriendIds ?? [],
                    }),
                ),
        ]).catch(() => undefined);
        return () => {
            controller.abort();
            controllerRef.current?.abort();
        };
    }, [followJob]);

    const friendById = useMemo(() => new Map(allFriends.map((friend) => [friend.id, friend])), [allFriends]);
    const graph = useMemo(() => {
        const excluded = new Set(settings.excluded);
        const edges = buildMutualEdges(snapshot?.relationships || {}).filter((edge) => !excluded.has(edge.source) && !excluded.has(edge.target));
        const degrees = countMutualDegrees(edges);
        const ids = Array.from(new Set([...edges.flatMap((edge) => [edge.source, edge.target]), ...Object.keys(snapshot?.relationships || {})]))
            .filter((id) => !excluded.has(id))
            .slice(0, 200);
        const allowed = new Set(ids);
        return { ids, edges: edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)), degrees };
    }, [settings.excluded, snapshot]);
    const positions = useMemo(() => layoutGraph(graph.ids, graph.edges, settings), [graph.edges, graph.ids, settings]);

    async function startFetch() {
        if (currentUser.hasSharedConnectionsOptOut) {
            setError("Mutual connections sharing is disabled on this VRChat account.");
            return;
        }
        setProcessed(0);
        setTotal(allFriends.length);
        await followJob();
    }

    function stopFetch() {
        controllerRef.current?.abort();
        void cancelMutualGraphFetch();
        setFetching(false);
    }

    function persistSettings(next: LayoutSettings) {
        setSettings(next);
        void fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mutualGraphLayoutIterations: next.iterations,
                mutualGraphLayoutSpacing: next.spacing,
                mutualGraphEdgeCurvature: next.curvature,
                mutualGraphCommunitySeparation: next.separation,
                mutualGraphExcludedFriendIds: next.excluded,
            }),
        });
    }

    function hideFriend(id: string) {
        persistSettings({ ...settings, excluded: Array.from(new Set([...settings.excluded, id])) });
        setNodeMenu(null);
    }

    async function refreshFriend(id: string) {
        setNodeMenu(null);
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setFetching(true);
        setProcessed(0);
        setTotal(1);
        setError("");
        try {
            const result = await refreshMutualGraphFriend(id, controller.signal);
            setSnapshot(result.snapshot);
        } catch (refreshError) {
            if (refreshError && typeof refreshError === "object" && "status" in refreshError && refreshError.status === 401) window.location.assign("/login");
            if (!(refreshError instanceof DOMException && refreshError.name === "AbortError")) setError(refreshError instanceof Error ? refreshError.message : "The selected mutual-friend entry could not be refreshed.");
        } finally {
            setFetching(false);
        }
    }

    return (
        <section id="chart" className="flex h-full min-h-0 flex-col overflow-hidden p-2" aria-labelledby="mutual-heading">
            <h1 id="mutual-heading" className="sr-only">
                Mutual Friends
            </h1>
            <div className="flex flex-wrap items-center gap-3 pb-3">
                {fetching ? (
                    <button type="button" onClick={stopFetch} className="inline-flex h-9 items-center gap-2 rounded-md bg-destructive px-3 text-xs text-white">
                        <Loader2 className="size-4 animate-spin" />
                        <Square className="size-3" /> Stop
                    </button>
                ) : (
                    <button type="button" onClick={() => void startFetch()} disabled={!allFriends.length || currentUser.hasSharedConnectionsOptOut} className="h-9 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                        {snapshot ? "Fetch again" : "Start fetch"}
                    </button>
                )}
                {graph.ids.length ? (
                    <select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)} className="h-9 min-w-60 rounded-md border border-input bg-background px-2 text-xs" aria-label="Go to friend">
                        <option value="">Go to friend</option>
                        {graph.ids
                            .toSorted((left, right) => displayName(left, friendById).localeCompare(displayName(right, friendById)))
                            .map((id) => (
                                <option key={id} value={id}>
                                    {displayName(id, friendById)}
                                </option>
                            ))}
                    </select>
                ) : null}
                {graph.ids.length ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                        {graph.ids.length} nodes · {graph.edges.length} relationships
                    </span>
                ) : null}
                <span className="min-w-2 flex-1" />
                <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted" aria-label="Mutual graph settings">
                    <Settings className="size-4" />
                </button>
                {fetching ? (
                    <div className="w-70 max-w-full rounded-md p-2 text-xs">
                        <div className="mb-1 flex justify-between">
                            <span>Friends processed</span>
                            <strong>
                                {processed} / {total || allFriends.length}
                            </strong>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary transition-[width]" style={{ width: `${total ? Math.min(100, (processed / total) * 100) : 0}%` }} />
                        </div>
                    </div>
                ) : null}
            </div>
            {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
            <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-lg bg-transparent" onClick={() => setNodeMenu(null)}>
                {snapshot && !graph.ids.length && !fetching ? <div className="grid size-full place-items-center text-sm text-muted-foreground">No relationships were discovered.</div> : null}
                {!snapshot ? <div className="grid size-full place-items-center text-sm text-muted-foreground">Start a fetch to build the mutual-friends graph.</div> : null}
                {graph.ids.length ? <GraphCanvas ids={graph.ids} edges={graph.edges} positions={positions} degrees={graph.degrees} curvature={settings.curvature} selected={selectedFriendId} friendById={friendById} openUser={openUser} menu={(id, x, y) => setNodeMenu({ id, x, y })} /> : null}
                {nodeMenu ? <NodeMenu node={nodeMenu} name={displayName(nodeMenu.id, friendById)} details={() => openUser(nodeMenu.id)} refresh={() => void refreshFriend(nodeMenu.id)} hide={() => hideFriend(nodeMenu.id)} /> : null}
            </div>
            {settingsOpen ? <SettingsPanel settings={settings} friends={allFriends} changed={persistSettings} close={() => setSettingsOpen(false)} /> : null}
        </section>
    );
}

function displayName(id: string, friends: Map<string, VrchatUser>) {
    return friends.get(id)?.displayName || id;
}

function layoutGraph(ids: string[], edges: MutualEdge[], settings: LayoutSettings) {
    const count = ids.length;
    const positions = new Map<string, Position>();
    if (!count) return positions;
    ids.forEach((id, index) => {
        const angle = index * 2.399963;
        const radius = 80 + Math.sqrt(index) * 32;
        positions.set(id, { x: 500 + Math.cos(angle) * radius, y: 310 + Math.sin(angle) * radius });
    });
    const edgePairs = edges.map((edge) => [ids.indexOf(edge.source), ids.indexOf(edge.target)] as const).filter(([left, right]) => left >= 0 && right >= 0);
    const values = ids.map((id) => positions.get(id) || { x: 500, y: 310 });
    const steps = Math.min(150, Math.max(30, Math.round(settings.iterations / 10)));
    const repulsion = Math.max(80, settings.spacing * settings.spacing * 0.85);
    for (let step = 0; step < steps; step += 1) {
        const force = values.map(() => ({ x: 0, y: 0 }));
        for (let left = 0; left < count; left += 1) {
            for (let right = left + 1; right < count; right += 1) {
                const dx = values[left].x - values[right].x || 0.1;
                const dy = values[left].y - values[right].y || 0.1;
                const squared = Math.max(25, dx * dx + dy * dy);
                const amount = repulsion / squared;
                force[left].x += dx * amount;
                force[left].y += dy * amount;
                force[right].x -= dx * amount;
                force[right].y -= dy * amount;
            }
        }
        for (const [left, right] of edgePairs) {
            const dx = values[right].x - values[left].x;
            const dy = values[right].y - values[left].y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const amount = (distance - settings.spacing * 2.2) * 0.0015;
            force[left].x += dx * amount;
            force[left].y += dy * amount;
            force[right].x -= dx * amount;
            force[right].y -= dy * amount;
        }
        values.forEach((value, index) => {
            const communityAngle = ((index % colors.length) / colors.length) * Math.PI * 2;
            value.x = Math.min(960, Math.max(40, value.x + force[index].x * 0.4 + Math.cos(communityAngle) * settings.separation * 0.08));
            value.y = Math.min(580, Math.max(40, value.y + force[index].y * 0.4 + Math.sin(communityAngle) * settings.separation * 0.08));
        });
    }
    ids.forEach((id, index) => {
        positions.set(id, values[index]);
    });
    return positions;
}

function GraphCanvas({
    ids,
    edges,
    positions,
    degrees,
    curvature,
    selected,
    friendById,
    openUser,
    menu,
}: {
    ids: string[];
    edges: MutualEdge[];
    positions: Map<string, Position>;
    degrees: Map<string, number>;
    curvature: number;
    selected: string;
    friendById: Map<string, VrchatUser>;
    openUser: (id: string) => void;
    menu: (id: string, x: number, y: number) => void;
}) {
    const [camera, setCamera] = useState({ x: 0, y: 0, width: 1000, height: 620 });
    const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

    useEffect(() => {
        const position = positions.get(selected);
        if (position) setCamera({ x: position.x - 250, y: position.y - 155, width: 500, height: 310 });
    }, [positions, selected]);

    return (
        <svg
            viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
            className="size-full touch-none select-none"
            role="img"
            aria-label="Mutual friend connection graph"
            onDoubleClick={() => setCamera({ x: 0, y: 0, width: 1000, height: 620 })}
            onWheel={(event) => {
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                const ratioX = (event.clientX - bounds.left) / bounds.width;
                const ratioY = (event.clientY - bounds.top) / bounds.height;
                const factor = event.deltaY > 0 ? 1.15 : 0.87;
                setCamera((current) => {
                    const width = Math.min(1400, Math.max(180, current.width * factor));
                    const height = width * 0.62;
                    const focusX = current.x + current.width * ratioX;
                    const focusY = current.y + current.height * ratioY;
                    return { x: focusX - width * ratioX, y: focusY - height * ratioY, width, height };
                });
            }}
            onPointerDown={(event) => {
                if ((event.target as Element).closest("[data-graph-node]")) return;
                dragRef.current = { active: true, x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag.active) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const dx = ((event.clientX - drag.x) / bounds.width) * camera.width;
                const dy = ((event.clientY - drag.y) / bounds.height) * camera.height;
                dragRef.current = { active: true, x: event.clientX, y: event.clientY };
                setCamera((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
            }}
            onPointerUp={(event) => {
                dragRef.current.active = false;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
                dragRef.current.active = false;
            }}
        >
            <defs>
                {ids.map((id) => {
                    const image = safeVrchatMediaUrl(friendById.get(id)?.currentAvatarThumbnailImageUrl);
                    return image ? (
                        <pattern key={id} id={`node-${id}`} width="1" height="1">
                            <VrchatSvgImage src={image} width="40" height="40" preserveAspectRatio="xMidYMid slice" />
                        </pattern>
                    ) : null;
                })}
            </defs>
            <g opacity=".55">
                {edges.map((edge) => {
                    const source = positions.get(edge.source);
                    const target = positions.get(edge.target);
                    if (!source || !target) return null;
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const length = Math.max(1, Math.hypot(dx, dy));
                    const bend = curvature * length;
                    const cx = (source.x + target.x) / 2 - (dy / length) * bend;
                    const cy = (source.y + target.y) / 2 + (dx / length) * bend;
                    return <path key={`${edge.source}:${edge.target}`} d={`M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`} fill="none" stroke="currentColor" className="text-border" strokeWidth="1" />;
                })}
            </g>
            {ids.map((id, index) => {
                const position = positions.get(id);
                if (!position) return null;
                const degree = degrees.get(id) || 0;
                const radius = Math.min(20, 7 + Math.sqrt(degree) * 2);
                const friend = friendById.get(id);
                const image = safeVrchatMediaUrl(friend?.currentAvatarThumbnailImageUrl);
                return (
                    <g
                        key={id}
                        data-graph-node
                        transform={`translate(${position.x} ${position.y})`}
                        className="cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            openUser(id);
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            menu(id, event.clientX, event.clientY);
                        }}
                    >
                        <circle r={radius + (selected === id ? 4 : 2)} fill={selected === id ? "hsl(var(--primary))" : "#f2f2f2"} />
                        <circle r={radius} fill={image ? `url(#node-${id})` : colors[index % colors.length]} />
                        <text x={radius + 5} y="4" className="fill-foreground text-[11px]" style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 }}>
                            {displayName(id, friendById).slice(0, 20)}
                        </text>
                        <title>
                            {displayName(id, friendById)}: {degree} connections
                        </title>
                    </g>
                );
            })}
        </svg>
    );
}

function SettingsPanel({ settings, friends, changed, close }: { settings: LayoutSettings; friends: VrchatUser[]; changed: (settings: LayoutSettings) => void; close: () => void }) {
    return (
        <>
            <button type="button" className="fixed inset-0 z-40 bg-black/35" aria-label="Close mutual graph settings" onClick={close} />
            <aside className="fixed top-0 right-0 z-50 h-full w-90 max-w-[calc(100vw-1rem)] overflow-y-auto border-l border-border bg-background p-4 shadow-2xl">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Mutual graph settings</h2>
                    <button type="button" onClick={close} className="inline-flex size-8 items-center justify-center rounded hover:bg-muted" aria-label="Close settings">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="mt-4 space-y-5">
                    <SettingRange label="Layout iterations" value={settings.iterations} min={300} max={1500} step={100} changed={(iterations) => changed({ ...settings, iterations })} help="Higher values refine the graph layout but take longer." />
                    <SettingRange label="Layout spacing" value={settings.spacing} min={8} max={240} step={1} changed={(spacing) => changed({ ...settings, spacing })} help="Controls the target distance between connected nodes." />
                    <SettingRange label="Edge curvature" value={settings.curvature} min={0} max={0.2} step={0.01} changed={(curvature) => changed({ ...settings, curvature })} help="Separates overlapping relationship lines." />
                    <SettingRange label="Community separation" value={settings.separation} min={0} max={3} step={0.1} changed={(separation) => changed({ ...settings, separation })} help="Adds space between graph communities." />
                    <div>
                        <label className="text-xs font-medium">Exclude friends</label>
                        <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded border border-border p-1">
                            {friends
                                .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
                                .map((friend) => (
                                    <label key={friend.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                                        <input type="checkbox" checked={settings.excluded.includes(friend.id)} onChange={() => changed({ ...settings, excluded: settings.excluded.includes(friend.id) ? settings.excluded.filter((id) => id !== friend.id) : [...settings.excluded, friend.id] })} className="accent-primary" />
                                        {friend.displayName}
                                    </label>
                                ))}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">Excluded friends are hidden from the rendered graph, not deleted from the MongoDB snapshot.</p>
                    </div>
                    <button type="button" onClick={() => changed(defaults)} className="h-8 w-full rounded border border-input text-xs">
                        Reset defaults
                    </button>
                </div>
            </aside>
        </>
    );
}

function SettingRange({ label, value, min, max, step, changed, help }: { label: string; value: number; min: number; max: number; step: number; changed: (value: number) => void; help: string }) {
    return (
        <label className="block text-xs">
            <span className="flex justify-between font-medium">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">{value}</span>
            </span>
            <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => changed(Number(event.target.value))} className="mt-2 w-full accent-primary" />
            <span className="mt-1 block text-[10px] text-muted-foreground">{help}</span>
        </label>
    );
}

function NodeMenu({ node, name, details, refresh, hide }: { node: { x: number; y: number }; name: string; details: () => void; refresh: () => void; hide: () => void }) {
    return (
        <div className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-xs shadow-xl" style={{ left: Math.max(8, node.x - 180), top: Math.max(8, node.y - 30) }}>
            <div className="truncate px-2 py-1 text-[10px] text-muted-foreground">{name}</div>
            <button type="button" onClick={details} className="flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                <User className="size-4" /> View details
            </button>
            <button type="button" onClick={refresh} className="flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                <RefreshCw className="size-4" /> Refresh mutuals
            </button>
            <button type="button" onClick={hide} className="flex w-full items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                <EyeOff className="size-4" /> Hide friend
            </button>
        </div>
    );
}
