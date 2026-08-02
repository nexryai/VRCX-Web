"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Apple, Clipboard, ExternalLink, ImageIcon, Loader2, Monitor, RefreshCw, Smartphone, User, X } from "lucide-react";

import { FriendAvatar } from "@/components/friends/friend-avatar";
import type { VrchatUser, VrchatWorld } from "@/lib/vrchat/types";

type WorldTab = "Info" | "Instances" | "JSON";

export function WorldDialog({ worldId, friends, openUser, onClose }: { worldId: string; friends: VrchatUser[]; openUser: (userId: string) => void; onClose: () => void }) {
    const [world, setWorld] = useState<VrchatWorld | null>(null);
    const [tab, setTab] = useState<WorldTab>("Info");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");
    const closeButton = useRef<HTMLButtonElement>(null);

    const load = useCallback(
        async (refresh = false) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/worlds/${encodeURIComponent(worldId)}${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; world?: VrchatWorld };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.world) throw new Error(payload.error || "The world could not be loaded.");
                setWorld(payload.world);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "The world could not be loaded.");
            } finally {
                setLoading(false);
            }
        },
        [worldId],
    );

    useEffect(() => {
        setWorld(null);
        setTab("Info");
        void load();
        closeButton.current?.focus();
    }, [load]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    async function copy(value: string, label: string) {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1_500);
    }

    const worldFriends = useMemo(() => friends.filter((friend) => friend.location?.startsWith(`${worldId}:`)), [friends, worldId]);
    return (
        <div className="fixed inset-0 z-[82] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close world details" />
            <section role="dialog" aria-modal="true" aria-labelledby="world-dialog-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background p-3 shadow-2xl sm:h-[min(86dvh,760px)] sm:max-w-[892px] sm:rounded-xl sm:border sm:p-4">
                <button ref={closeButton} type="button" onClick={onClose} className="absolute top-2 right-2 z-40 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow hover:text-foreground" aria-label="Close">
                    <X className="size-4" />
                </button>
                {loading && !world ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Loading world…
                    </div>
                ) : null}
                {!loading && !world ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div> : null}
                {world ? (
                    <>
                        <header className="flex shrink-0 flex-col gap-3 pr-8 sm:flex-row sm:pr-10">
                            <div className="flex h-[120px] w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                {world.thumbnailImageUrl || world.imageUrl ? <img src={world.thumbnailImageUrl || world.imageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon className="size-8 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="world-dialog-title" className="break-words font-bold">
                                    {world.name}
                                </h2>
                                {world.authorName ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (world.authorId) {
                                                onClose();
                                                openUser(world.authorId);
                                            }
                                        }}
                                        disabled={!world.authorId}
                                        className="mt-1 font-mono text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none"
                                    >
                                        {world.authorName}
                                    </button>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                    <Badge>{world.releaseStatus || "private"}</Badge>
                                    {worldPlatforms(world).map((platform) => (
                                        <Badge key={platform}>
                                            {platform === "standalonewindows" ? <Monitor className="size-3" /> : platform === "android" ? <Smartphone className="size-3" /> : <Apple className="size-3" />}
                                            {platformLabel(platform)}
                                        </Badge>
                                    ))}
                                    {(world.tags || [])
                                        .filter((tag) => tag.startsWith("content_"))
                                        .map((tag) => (
                                            <Badge key={tag}>{tag.slice(8).replaceAll("_", " ")}</Badge>
                                        ))}
                                </div>
                                {world.description && world.description !== world.name ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs">{world.description}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-end gap-2 sm:items-center">
                                <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40" aria-label="Refresh world">
                                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                                </button>
                                <button type="button" onClick={() => void copy(`https://vrchat.com/home/world/${world.id}`, "URL")} className="inline-flex h-9 items-center gap-1 rounded-full border border-input px-3 text-xs">
                                    <Clipboard className="size-4" />
                                    {copied === "URL" ? "Copied" : "Share"}
                                </button>
                                <a href={`https://vrchat.com/home/world/${encodeURIComponent(world.id)}`} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-full border border-input" aria-label="Open on VRChat">
                                    <ExternalLink className="size-4" />
                                </a>
                            </div>
                        </header>
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="World details">
                            {(["Info", "Instances", "JSON"] as WorldTab[]).map((item) => (
                                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tab === "Info" ? <WorldInfo world={world} copy={copy} copied={copied} /> : null}
                            {tab === "Instances" ? (
                                <WorldInstances
                                    world={world}
                                    friends={worldFriends}
                                    openUser={(id) => {
                                        onClose();
                                        openUser(id);
                                    }}
                                />
                            ) : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(world, null, 2)}</pre> : null}
                        </div>
                    </>
                ) : null}
            </section>
        </div>
    );
}

function WorldInfo({ world, copy, copied }: { world: VrchatWorld; copy: (value: string, label: string) => Promise<void>; copied: string }) {
    const favoriteRate = world.visits ? `${Math.round(((world.favorites || 0) / world.visits) * 10_000) / 100}%` : "—";
    const platforms = worldPlatforms(world).map(platformLabel).join(", ") || "Unknown";
    const occupants = world.occupants ?? (world.publicOccupants !== undefined || world.privateOccupants !== undefined ? (world.publicOccupants || 0) + (world.privateOccupants || 0) : undefined);
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1">
            <Info label="World ID" value={copied === "ID" ? "Copied" : world.id} action={() => void copy(world.id, "ID")} />
            <Info label="Occupants" value={number(occupants)} />
            <Info label="Capacity" value={`${world.recommendedCapacity ?? world.capacity ?? "—"} / ${world.capacity ?? "—"}`} />
            <Info label="Favorites" value={number(world.favorites)} />
            <Info label="Visits" value={number(world.visits)} />
            <Info label="Favorite rate" value={favoriteRate} />
            <Info label="Created" value={date(world.created_at)} />
            <Info label="Last updated" value={date(world.updated_at)} />
            {world.labsPublicationDate && world.labsPublicationDate !== "none" ? <Info label="Labs publication date" value={date(world.labsPublicationDate)} /> : null}
            {world.publicationDate && world.publicationDate !== "none" ? <Info label="Publication date" value={date(world.publicationDate)} /> : null}
            <Info label="Version" value={world.version === undefined ? "—" : String(world.version)} />
            <Info label="Heat" value={metric(world.heat, "🔥")} />
            <Info label="Popularity" value={metric(world.popularity, "💖")} />
            <Info label="Platform" value={platforms} />
            <Info
                label="Author tags"
                value={
                    (world.tags || [])
                        .filter((tag) => tag.startsWith("author_tag_"))
                        .map((tag) => tag.slice(11))
                        .join(", ") || "—"
                }
            />
        </div>
    );
}

function WorldInstances({ world, friends, openUser }: { world: VrchatWorld; friends: VrchatUser[]; openUser: (id: string) => void }) {
    const instances = worldInstances(world);
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                    <User className="mr-1 inline size-4" />
                    Public {world.publicOccupants ?? "—"}
                </span>
                <span>Private {world.privateOccupants ?? "—"}</span>
                <span>
                    Capacity {world.recommendedCapacity ?? world.capacity ?? "—"}/{world.capacity ?? "—"}
                </span>
            </div>
            {instances.length ? (
                <div className="space-y-2">
                    {instances.map((instance) => (
                        <section key={instance.id} className="rounded-lg bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="break-all font-mono text-[10px] text-muted-foreground">{instance.id}</span>
                                <span className="shrink-0 text-xs">{instance.occupants} occupants</span>
                            </div>
                            <FriendTiles friends={friends.filter((friend) => friend.location === `${world.id}:${instance.id}`)} openUser={openUser} />
                        </section>
                    ))}
                </div>
            ) : friends.length ? (
                <section className="rounded-lg bg-background p-3">
                    <p className="text-xs text-muted-foreground">Instances observed from the current friend projection</p>
                    <FriendTiles friends={friends} openUser={openUser} />
                </section>
            ) : (
                <div className="flex min-h-48 items-center justify-center text-xs text-muted-foreground">No remotely visible instances.</div>
            )}
        </div>
    );
}

function FriendTiles({ friends, openUser }: { friends: VrchatUser[]; openUser: (id: string) => void }) {
    return friends.length ? (
        <div className="mt-2 flex flex-wrap">
            {friends.map((friend) => (
                <button key={friend.id} type="button" onClick={() => openUser(friend.id)} className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                    <FriendAvatar friend={friend} size="sm" />
                    <span className="min-w-0 truncate font-medium">{friend.displayName}</span>
                </button>
            ))}
        </div>
    ) : null;
}

function worldInstances(world: VrchatWorld) {
    return (world.instances || []).flatMap((value) => {
        if (!Array.isArray(value) || typeof value[0] !== "string") return [];
        const occupants = typeof value[1] === "number" ? value[1] : 0;
        return [{ id: value[0], occupants }];
    });
}

function worldPlatforms(world: VrchatWorld) {
    return Array.from(new Set((world.unityPackages || []).map((item) => item.platform)));
}

function platformLabel(value: string) {
    return value === "standalonewindows" ? "PC" : value === "android" ? "Quest" : value === "ios" ? "iOS" : value;
}

function Badge({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 capitalize">{children}</span>;
}

function Info({ label, value, action }: { label: string; value: string; action?: () => void }) {
    const content = (
        <>
            <span className="block truncate font-medium leading-[18px]">{label}</span>
            <span className="block truncate text-xs">{value}</span>
        </>
    );
    return action ? (
        <button type="button" onClick={action} className="box-border min-w-0 rounded p-1.5 text-left text-[13px] hover:bg-muted">
            {content}
        </button>
    ) : (
        <div className="box-border min-w-0 p-1.5 text-[13px]">{content}</div>
    );
}

function number(value?: number) {
    return value === undefined ? "—" : new Intl.NumberFormat("en").format(value);
}

function metric(value: number | undefined, icon: string) {
    return value === undefined ? "—" : `${number(value)} ${icon.repeat(Math.min(Math.max(0, Math.floor(value)), 10))}`;
}

function date(value?: string) {
    if (!value || value === "none") return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}
