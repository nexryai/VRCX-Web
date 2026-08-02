"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, RefreshCw, Search, ShieldUser, Trash2, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import type { VrchatPlayerModeration } from "@/lib/vrchat/types";

const moderationLabels: Record<string, string> = {
    block: "Block",
    unblock: "Unblock",
    mute: "Mute",
    unmute: "Unmute",
    interactOn: "Enable interaction",
    interactOff: "Disable interaction",
    muteChat: "Mute chatbox",
    unmuteChat: "Unmute chatbox",
};

function formatDate(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function moderationKey(row: VrchatPlayerModeration) {
    return row.id || `${row.type}:${row.sourceUserId}:${row.targetUserId}:${row.created || ""}`;
}

export function ModerationView() {
    const currentUser = useCurrentUser();
    const { openUser } = useFriends();
    const [moderations, setModerations] = useState<VrchatPlayerModeration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [confirmKey, setConfirmKey] = useState("");
    const [deletingKey, setDeletingKey] = useState("");

    const loadModerations = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/moderations", { cache: "no-store" });
            const payload = (await response.json()) as { error?: string; moderations?: VrchatPlayerModeration[] };
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok || !payload.moderations) throw new Error(payload.error || "Moderations could not be loaded.");
            setModerations(payload.moderations);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Moderations could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadModerations();
    }, [loadModerations]);

    const types = useMemo(() => Array.from(new Set(moderations.map((row) => row.type))).toSorted(), [moderations]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return moderations
            .filter((row) => {
                if (typeFilter !== "all" && row.type !== typeFilter) return false;
                if (!query) return true;
                return `${row.sourceDisplayName || ""} ${row.targetDisplayName || ""} ${row.sourceUserId} ${row.targetUserId}`.toLocaleLowerCase().includes(query);
            })
            .toSorted((a, b) => Date.parse(b.created || "") - Date.parse(a.created || ""));
    }, [moderations, search, typeFilter]);

    async function deleteModeration(row: VrchatPlayerModeration) {
        const key = moderationKey(row);
        setDeletingKey(key);
        setError("");
        try {
            const response = await fetch("/api/moderations", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ moderated: row.targetUserId, type: row.type }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The moderation could not be removed.");
            setModerations((current) => current.filter((item) => moderationKey(item) !== key));
            setConfirmKey("");
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "The moderation could not be removed.");
        } finally {
            setDeletingKey("");
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="moderation-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter moderation type">
                    <option value="all">All moderation types</option>
                    {types.map((type) => (
                        <option key={type} value={type}>
                            {moderationLabels[type] || type}
                        </option>
                    ))}
                </select>
                <label className="relative min-w-44 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder="Search moderations" />
                </label>
                <button type="button" onClick={() => void loadModerations()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh moderations">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
                <h1 id="moderation-heading" className="sr-only">
                    Moderation
                </h1>
                <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <ShieldUser aria-hidden="true" className="size-4" />
                    {filtered.length} moderation records
                    {loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                </div>
                {error ? <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
                {!loading && !error && filtered.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">No moderation records match the current filters.</p> : null}

                <div className="space-y-2 md:hidden">
                    {filtered.map((row) => {
                        const key = moderationKey(row);
                        const canDelete = row.sourceUserId === currentUser.id;
                        return (
                            <article key={key} className="rounded-lg border border-border bg-card p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{moderationLabels[row.type] || row.type}</span>
                                        <button type="button" onClick={() => openUser(row.targetUserId)} className="mt-2 block max-w-full truncate text-left text-sm font-medium hover:text-primary">
                                            {row.targetDisplayName || row.targetUserId}
                                        </button>
                                        <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(row.created)}</p>
                                    </div>
                                    {canDelete ? <DeleteAction row={row} itemKey={key} confirmKey={confirmKey} deletingKey={deletingKey} onConfirm={setConfirmKey} onDelete={deleteModeration} /> : null}
                                </div>
                            </article>
                        );
                    })}
                </div>

                {filtered.length ? (
                    <table className="hidden w-full min-w-[760px] border-separate border-spacing-0 overflow-hidden rounded-lg border border-border text-left text-xs md:table">
                        <thead className="sticky top-0 z-10 bg-muted text-[10px] tracking-wide text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2 font-medium">Date</th>
                                <th className="px-3 py-2 font-medium">Type</th>
                                <th className="px-3 py-2 font-medium">Source</th>
                                <th className="px-3 py-2 font-medium">Target</th>
                                <th className="w-32 px-3 py-2 text-right font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row) => {
                                const key = moderationKey(row);
                                return (
                                    <tr key={key} className="hover:bg-muted/60">
                                        <td className="whitespace-nowrap border-t border-border px-3 py-2 text-muted-foreground">{formatDate(row.created)}</td>
                                        <td className="border-t border-border px-3 py-2">
                                            <span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{moderationLabels[row.type] || row.type}</span>
                                        </td>
                                        <td className="max-w-48 border-t border-border px-3 py-2">
                                            <button type="button" onClick={() => openUser(row.sourceUserId)} className="max-w-full truncate text-left hover:text-primary">
                                                {row.sourceDisplayName || row.sourceUserId}
                                            </button>
                                        </td>
                                        <td className="max-w-56 border-t border-border px-3 py-2">
                                            <button type="button" onClick={() => openUser(row.targetUserId)} className="max-w-full truncate text-left hover:text-primary">
                                                {row.targetDisplayName || row.targetUserId}
                                            </button>
                                        </td>
                                        <td className="border-t border-border px-3 py-2 text-right">{row.sourceUserId === currentUser.id ? <DeleteAction row={row} itemKey={key} confirmKey={confirmKey} deletingKey={deletingKey} onConfirm={setConfirmKey} onDelete={deleteModeration} /> : null}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : null}
            </div>
        </section>
    );
}

function DeleteAction({ row, itemKey, confirmKey, deletingKey, onConfirm, onDelete }: { row: VrchatPlayerModeration; itemKey: string; confirmKey: string; deletingKey: string; onConfirm: (key: string) => void; onDelete: (row: VrchatPlayerModeration) => Promise<void> }) {
    if (confirmKey === itemKey) {
        return (
            <span className="inline-flex items-center gap-1">
                <button type="button" onClick={() => onConfirm("")} className="inline-flex size-8 items-center justify-center rounded-md bg-secondary" aria-label="Cancel" disabled={deletingKey === itemKey}>
                    <X aria-hidden="true" className="size-3.5" />
                </button>
                <button type="button" onClick={() => void onDelete(row)} className="inline-flex h-8 items-center gap-1 rounded-md bg-destructive px-2 text-[10px] text-white" disabled={deletingKey === itemKey}>
                    {deletingKey === itemKey ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
                    Remove
                </button>
            </span>
        );
    }
    return (
        <button type="button" onClick={() => onConfirm(itemKey)} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${moderationLabels[row.type] || row.type} moderation`}>
            <Trash2 aria-hidden="true" className="size-3.5" />
        </button>
    );
}
