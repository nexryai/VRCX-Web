"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Loader2, Network, Play, RefreshCw, Square, Users } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FriendAvatar } from "@/components/friends/friend-avatar";
import { useFriends } from "@/components/friends/friends-provider";
import { buildMutualEdges, countMutualDegrees, type MutualGraphSnapshot } from "@/lib/mutual-graph";
import type { VrchatUser } from "@/lib/vrchat/types";

const VISUAL_NODE_LIMIT = 80;

function graphKey(userId: string) {
    return `vrcx-web:mutual-graph:${userId}`;
}

function readSnapshot(userId: string): MutualGraphSnapshot | null {
    try {
        const value = window.localStorage.getItem(graphKey(userId));
        return value ? (JSON.parse(value) as MutualGraphSnapshot) : null;
    } catch {
        return null;
    }
}

function saveSnapshot(userId: string, snapshot: MutualGraphSnapshot) {
    try {
        window.localStorage.setItem(graphKey(userId), JSON.stringify(snapshot));
        return true;
    } catch {
        return false;
    }
}

function delay(milliseconds: number) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchMutualPage(userId: string, offset: number, signal: AbortSignal) {
    let lastError = "Mutual friends could not be loaded.";
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`/api/users/${userId}/mutuals?offset=${offset}`, { cache: "no-store", signal });
        const payload = (await response.json()) as { error?: string; mutuals?: VrchatUser[] };
        if (response.status === 401) {
            window.location.assign("/login");
            throw new Error("The VRChat session expired.");
        }
        if (response.ok && payload.mutuals) return payload.mutuals;
        lastError = payload.error || lastError;
        if (response.status !== 429) throw Object.assign(new Error(lastError), { status: response.status });
        await delay(500 * 2 ** attempt);
    }
    throw new Error(lastError);
}

export function MutualFriendsView() {
    const currentUser = useCurrentUser();
    const { allFriends, openUser } = useFriends();
    const [snapshot, setSnapshot] = useState<MutualGraphSnapshot | null>(null);
    const [fetching, setFetching] = useState(false);
    const [processed, setProcessed] = useState(0);
    const [error, setError] = useState("");
    const [cacheNotice, setCacheNotice] = useState("");
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setSnapshot(readSnapshot(currentUser.id));
        return () => controllerRef.current?.abort();
    }, [currentUser.id]);

    const friendById = useMemo(() => new Map(allFriends.map((friend) => [friend.id, friend])), [allFriends]);
    const edges = useMemo(() => buildMutualEdges(snapshot?.relationships || {}), [snapshot]);
    const degrees = useMemo(() => countMutualDegrees(edges), [edges]);
    const ranked = useMemo(() => Array.from(degrees.entries()).toSorted((a, b) => b[1] - a[1]), [degrees]);

    async function fetchGraph() {
        if (currentUser.hasSharedConnectionsOptOut) {
            setError("Mutual connections sharing is disabled on this VRChat account.");
            return;
        }
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setFetching(true);
        setProcessed(0);
        setError("");
        setCacheNotice("");
        const relationships: Record<string, string[]> = {};
        const optedOut: string[] = [];
        try {
            for (let index = 0; index < allFriends.length; index += 1) {
                if (controller.signal.aborted) return;
                const friend = allFriends[index];
                const mutualIds: string[] = [];
                try {
                    for (let offset = 0; offset <= 5_000; offset += 100) {
                        const page = await fetchMutualPage(friend.id, offset, controller.signal);
                        mutualIds.push(...page.map((user) => user.id).filter((id) => id !== "usr_00000000-0000-0000-0000-000000000000"));
                        if (page.length < 100) break;
                        await delay(210);
                    }
                    relationships[friend.id] = Array.from(new Set(mutualIds));
                } catch (friendError) {
                    if (controller.signal.aborted) return;
                    const status = friendError && typeof friendError === "object" && "status" in friendError ? friendError.status : undefined;
                    if (status === 403 || status === 404) optedOut.push(friend.id);
                    else throw friendError;
                }
                setProcessed(index + 1);
                await delay(210);
            }
            const next = { relationships, optedOut, updatedAt: new Date().toISOString() };
            setSnapshot(next);
            if (!saveSnapshot(currentUser.id, next)) setCacheNotice("The graph is ready, but this browser could not persist the full snapshot.");
        } catch (fetchError) {
            if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) setError(fetchError instanceof Error ? fetchError.message : "The mutual graph could not be loaded.");
        } finally {
            setFetching(false);
        }
    }

    function cancelFetch() {
        controllerRef.current?.abort();
        setFetching(false);
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="mutual-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                {fetching ? (
                    <button type="button" onClick={cancelFetch} className="inline-flex h-9 items-center gap-2 rounded-md bg-destructive px-3 text-xs text-white">
                        <Square aria-hidden="true" className="size-3.5" />
                        Stop
                    </button>
                ) : (
                    <button type="button" onClick={() => void fetchGraph()} disabled={!allFriends.length || currentUser.hasSharedConnectionsOptOut} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
                        {snapshot ? <RefreshCw aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
                        {snapshot ? "Fetch again" : "Fetch mutual graph"}
                    </button>
                )}
                {fetching ? (
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        {processed} / {allFriends.length} friends
                    </span>
                ) : null}
                {snapshot ? <span className="ml-auto text-[10px] text-muted-foreground">Last fetched {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.updatedAt))}</span> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
                <h1 id="mutual-heading" className="sr-only">
                    Mutual Friends
                </h1>
                {error ? <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
                {cacheNotice ? <p className="mb-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{cacheNotice}</p> : null}
                {!snapshot ? (
                    <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                        <Network aria-hidden="true" className="size-10" />
                        <p className="max-w-lg text-sm">Fetching is explicit because VRCX queries mutual connections separately for every friend and respects users who have opted out.</p>
                    </div>
                ) : (
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
                        <GraphVisual ranked={ranked} edges={edges} friendById={friendById} />
                        <article className="rounded-xl border border-border bg-card p-3">
                            <header className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                                <Users aria-hidden="true" className="size-4 text-muted-foreground" />
                                <h2 className="text-xs font-semibold">Most connected</h2>
                                <span className="ml-auto text-[10px] text-muted-foreground">{edges.length} relationships</span>
                            </header>
                            <div className="max-h-[36rem] space-y-1 overflow-y-auto">
                                {ranked.slice(0, 100).map(([userId, count]) => {
                                    const friend = friendById.get(userId);
                                    return (
                                        <button type="button" key={userId} onClick={() => openUser(userId)} className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted">
                                            {friend ? <FriendAvatar friend={friend} size="sm" /> : <span className="size-8 rounded-full bg-muted" />}
                                            <span className="min-w-0 flex-1 truncate text-xs font-medium">{friend?.displayName || userId}</span>
                                            <span className="text-[10px] text-muted-foreground">{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </article>
                    </div>
                )}
            </div>
        </section>
    );
}

function GraphVisual({ ranked, edges, friendById }: { ranked: Array<[string, number]>; edges: Array<{ source: string; target: string }>; friendById: Map<string, VrchatUser> }) {
    const nodes = ranked.slice(0, VISUAL_NODE_LIMIT);
    const nodeIds = new Set(nodes.map(([id]) => id));
    const positions = new Map(
        nodes.map(([id], index) => {
            const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
            const radius = 240 - Math.min(90, (nodes[index]?.[1] || 0) * 2);
            return [id, { x: 500 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius }];
        }),
    );
    return (
        <article className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold">
                Connection graph <span className="font-normal text-muted-foreground">· top {nodes.length} nodes</span>
            </div>
            <div className="aspect-[5/3] min-h-72 w-full bg-background">
                <svg viewBox="0 0 1000 600" className="size-full" role="img" aria-label="Mutual friend connection graph">
                    {edges
                        .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
                        .map((edge) => {
                            const source = positions.get(edge.source);
                            const target = positions.get(edge.target);
                            return source && target ? <line key={`${edge.source}:${edge.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="currentColor" className="text-border" strokeWidth="1" /> : null;
                        })}
                    {nodes.map(([id, degree], index) => {
                        const position = positions.get(id);
                        if (!position) return null;
                        const radius = Math.min(18, 5 + Math.sqrt(degree) * 2);
                        return (
                            <g key={id}>
                                <circle cx={position.x} cy={position.y} r={radius} fill={`hsl(${(index * 47) % 360} 55% 55%)`} stroke="currentColor" strokeWidth="1" className="text-background" />
                                <title>
                                    {friendById.get(id)?.displayName || id}: {degree} connections
                                </title>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </article>
    );
}
