"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Check, Loader2, Star, X } from "lucide-react";

import type { VrchatFavorite, VrchatFavoriteGroup, VrchatFavoriteLimits } from "@/lib/vrchat/types";

type FavoriteKind = "avatar" | "friend" | "world";
type LocalGroup = { groupId: string; kind: FavoriteKind; name: string; count: number };
type LocalItem = { objectId: string };

const fallbackCapacity = { avatar: 50, friend: 150, vrcPlusWorld: 100, world: 100 } as const;

async function responsePayload<T>(response: Response) {
    const payload = (await response.json()) as T & { error?: string };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok) throw new Error(payload.error || "Favorites could not be updated.");
    return payload;
}

async function allRemoteRecords(signal: AbortSignal) {
    const records: VrchatFavorite[] = [];
    for (let offset = 0; offset <= 5_000; offset += 100) {
        const response = await fetch(`/api/favorites?section=records&offset=${offset}`, { cache: "no-store", signal });
        const payload = await responsePayload<{ favorites?: VrchatFavorite[] }>(response);
        const page = payload.favorites || [];
        records.push(...page);
        if (page.length < 100) break;
    }
    return records;
}

async function allRemoteGroups(signal: AbortSignal) {
    const groups: VrchatFavoriteGroup[] = [];
    for (let offset = 0; offset <= 500; offset += 50) {
        const response = await fetch(`/api/favorites?section=groups&offset=${offset}`, { cache: "no-store", signal });
        const payload = await responsePayload<{ groups?: VrchatFavoriteGroup[] }>(response);
        const page = payload.groups || [];
        groups.push(...page);
        if (page.length < 50) break;
    }
    return groups;
}

function matchesKind(kind: FavoriteKind, type: string) {
    return kind === "world" ? type === "world" || type === "vrcPlusWorld" : type === kind;
}

export function FavoriteAction({ kind, objectId, label }: { kind: FavoriteKind; objectId: string; label: string }) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [records, setRecords] = useState<VrchatFavorite[]>([]);
    const [remoteGroups, setRemoteGroups] = useState<VrchatFavoriteGroup[]>([]);
    const [limits, setLimits] = useState<VrchatFavoriteLimits>();
    const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
    const [localMemberships, setLocalMemberships] = useState<Set<string>>(new Set());
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            const controller = signal ? null : new AbortController();
            const requestSignal = signal || controller?.signal;
            setLoading(true);
            setError("");
            try {
                if (!requestSignal) return;
                const [nextRecords, nextRemoteGroups, limitResponse, localResponse] = await Promise.all([
                    allRemoteRecords(requestSignal),
                    allRemoteGroups(requestSignal),
                    fetch("/api/favorites?section=limits", { cache: "no-store", signal: requestSignal }),
                    fetch(`/api/local-favorites?kind=${kind}`, { cache: "no-store", signal: requestSignal }),
                ]);
                const limitPayload = await responsePayload<{ limits?: VrchatFavoriteLimits }>(limitResponse);
                const localPayload = await responsePayload<{ groups?: LocalGroup[] }>(localResponse);
                const nextLocalGroups = localPayload.groups || [];
                const localItems = await Promise.all(
                    nextLocalGroups.map(async (group) => {
                        const response = await fetch(`/api/local-favorites?kind=${kind}&groupId=${encodeURIComponent(group.groupId)}`, { cache: "no-store", signal: requestSignal });
                        return responsePayload<{ items?: LocalItem[] }>(response);
                    }),
                );
                setRecords(nextRecords);
                setRemoteGroups(nextRemoteGroups);
                setLimits(limitPayload.limits);
                setLocalGroups(nextLocalGroups);
                setLocalMemberships(new Set(nextLocalGroups.filter((_group, index) => (localItems[index].items || []).some((item) => item.objectId === objectId)).map((group) => group.groupId)));
            } catch (loadError) {
                if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Favorites could not be loaded.");
            } finally {
                if (!requestSignal?.aborted) setLoading(false);
            }
        },
        [kind, objectId],
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener("keydown", closeOnEscape);
            previouslyFocused?.focus();
        };
    }, [open]);

    const currentRemote = records.find((record) => record.favoriteId === objectId && matchesKind(kind, record.type));
    const visibleRemoteGroups = useMemo(
        () =>
            remoteGroups
                .filter((group) => matchesKind(kind, group.type))
                .map((group) => ({
                    ...group,
                    count: records.filter((record) => record.type === group.type && record.tags[0] === group.name).length,
                    capacity: limits?.maxFavoritesPerGroup?.[group.type] ?? fallbackCapacity[group.type as keyof typeof fallbackCapacity] ?? 100,
                })),
        [kind, limits, records, remoteGroups],
    );
    const currentRemoteGroup = currentRemote ? visibleRemoteGroups.find((group) => group.type === currentRemote.type && group.name === currentRemote.tags[0]) : undefined;
    const hasFavorite = Boolean(currentRemote || localMemberships.size);

    async function mutateRemote(group?: VrchatFavoriteGroup) {
        setBusy(true);
        setError("");
        try {
            const response = group ? await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: group.type, favoriteId: objectId, tags: group.name }) }) : await fetch(`/api/favorites/${encodeURIComponent(objectId)}`, { method: "DELETE" });
            await responsePayload(response);
            await load();
            setOpen(false);
        } catch (mutationError) {
            setError(mutationError instanceof Error ? mutationError.message : "The favorite could not be updated.");
        } finally {
            setBusy(false);
        }
    }

    async function toggleLocal(group: LocalGroup) {
        setBusy(true);
        setError("");
        try {
            const selected = localMemberships.has(group.groupId);
            const response = await fetch("/api/local-favorites", {
                method: selected ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(selected ? { action: "item", groupId: group.groupId, objectId } : { action: "add", kind, groupId: group.groupId, objectId }),
            });
            await responsePayload(response);
            await load();
        } catch (mutationError) {
            setError(mutationError instanceof Error ? mutationError.message : "The local favorite could not be updated.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={loading}
                className={`inline-flex size-9 items-center justify-center rounded-full border disabled:opacity-40 ${hasFavorite ? "border-primary bg-primary/15 text-primary" : "border-input hover:bg-muted"}`}
                aria-label={`Manage favorites for ${label}`}
            >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Star className={`size-4 ${hasFavorite ? "fill-current" : ""}`} />}
            </button>
            {open ? (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4">
                    <button type="button" className="absolute inset-0" onClick={() => setOpen(false)} aria-label="Close favorites" />
                    <section role="dialog" aria-modal="true" aria-labelledby="favorite-action-title" aria-busy={busy} className="relative max-h-[min(42rem,90dvh)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-2xl">
                        <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Close">
                            <X className="size-4" />
                        </button>
                        <h2 id="favorite-action-title" className="pr-8 font-semibold">
                            Favorites
                        </h2>
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <FavoriteSection title="VRChat Favorites">
                            {currentRemote ? (
                                <FavoriteGroupButton name={currentRemoteGroup?.displayName || currentRemote.tags[0] || "Current group"} count={currentRemoteGroup?.count ?? 1} capacity={currentRemoteGroup?.capacity} selected busy={busy} action={() => void mutateRemote()} />
                            ) : visibleRemoteGroups.length ? (
                                visibleRemoteGroups.map((group) => <FavoriteGroupButton key={group.id} name={group.displayName || group.name} count={group.count} capacity={group.capacity} busy={busy || group.count >= group.capacity} action={() => void mutateRemote(group)} />)
                            ) : (
                                <p className="py-3 text-center text-xs text-muted-foreground">No VRChat favorite groups available.</p>
                            )}
                        </FavoriteSection>
                        <FavoriteSection title="Local Favorites">
                            {localGroups.length ? (
                                localGroups.map((group) => <FavoriteGroupButton key={group.groupId} name={group.name} count={group.count} selected={localMemberships.has(group.groupId)} busy={busy} action={() => void toggleLocal(group)} />)
                            ) : (
                                <p className="py-3 text-center text-xs text-muted-foreground">Create a local group from the Favorites page first.</p>
                            )}
                        </FavoriteSection>
                    </section>
                </div>
            ) : null}
        </>
    );
}

function FavoriteSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-4">
            <h3 className="mb-2 text-center text-xs font-medium">{title}</h3>
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function FavoriteGroupButton({ name, count, capacity, selected = false, busy, action }: { name: string; count: number; capacity?: number; selected?: boolean; busy: boolean; action: () => void }) {
    return (
        <button type="button" onClick={action} disabled={busy} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-xs hover:bg-muted disabled:opacity-40">
            {selected ? <Check className="size-4" /> : null}
            <span className="min-w-0 break-words">{name}</span>
            <span className="shrink-0 text-muted-foreground">
                ({count}
                {capacity === undefined ? "" : ` / ${capacity}`})
            </span>
        </button>
    );
}
