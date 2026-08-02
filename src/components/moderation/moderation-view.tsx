"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Trash2, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import type { VrchatPlayerModeration } from "@/lib/vrchat/types";

type PageSize = 20 | 50 | 100;

const moderationTypes = ["block", "unblock", "mute", "unmute", "interactOn", "interactOff", "muteChat", "unmuteChat"];
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

function moderationKey(row: VrchatPlayerModeration) {
    return row.id || `${row.type}:${row.sourceUserId}:${row.targetUserId}:${row.created || ""}`;
}

function moderationTimestamp(row: VrchatPlayerModeration) {
    const timestamp = Date.parse(row.created || "");
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value?: string, long = false) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en", long ? { dateStyle: "long", timeStyle: "medium" } : { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function ModerationView() {
    const currentUser = useCurrentUser();
    const { openUser } = useFriends();
    const [moderations, setModerations] = useState<VrchatPlayerModeration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState<PageSize>(20);
    const [ascending, setAscending] = useState(false);
    const [deletingKey, setDeletingKey] = useState("");
    const [shiftHeld, setShiftHeld] = useState(false);

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
        void Promise.all([
            loadModerations(),
            fetch("/api/settings", { cache: "no-store" })
                .then((response) => response.json())
                .then((settings: { moderationFilters?: string[]; moderationTablePageSize?: PageSize }) => {
                    setFilters(settings.moderationFilters || []);
                    setPageSize(settings.moderationTablePageSize || 20);
                }),
        ]);
    }, [loadModerations]);

    useEffect(() => {
        const keyDown = (event: KeyboardEvent) => {
            if (event.key === "Shift") setShiftHeld(true);
        };
        const keyUp = (event: KeyboardEvent) => {
            if (event.key === "Shift") setShiftHeld(false);
        };
        const reset = () => setShiftHeld(false);
        window.addEventListener("keydown", keyDown);
        window.addEventListener("keyup", keyUp);
        window.addEventListener("blur", reset);
        return () => {
            window.removeEventListener("keydown", keyDown);
            window.removeEventListener("keyup", keyUp);
            window.removeEventListener("blur", reset);
        };
    }, []);

    const types = useMemo(() => Array.from(new Set([...moderationTypes, ...moderations.map((row) => row.type)])), [moderations]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return moderations
            .filter((row) => {
                if (filters.length && !filters.includes(row.type)) return false;
                if (!query) return true;
                return `${row.sourceDisplayName || ""} ${row.targetDisplayName || ""}`.toLocaleLowerCase().includes(query);
            })
            .toSorted((left, right) => (ascending ? 1 : -1) * (moderationTimestamp(left) - moderationTimestamp(right)));
    }, [ascending, filters, moderations, search]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

    function toggleFilter(type: string) {
        const next = filters.includes(type) ? filters.filter((value) => value !== type) : [...filters, type];
        setFilters(next);
        setPage(0);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moderationFilters: next }) });
    }

    function updatePageSize(moderationTablePageSize: PageSize) {
        setPageSize(moderationTablePageSize);
        setPage(0);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moderationTablePageSize }) });
    }

    async function refreshModerations() {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/monitor/reconcile", { method: "POST" });
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok && response.status !== 409) {
                const payload = (await response.json()) as { error?: string };
                throw new Error(payload.error || "Moderations could not be refreshed.");
            }
            await loadModerations();
        } catch (refreshError) {
            setError(refreshError instanceof Error ? refreshError.message : "Moderations could not be refreshed.");
            setLoading(false);
        }
    }

    async function deleteModeration(row: VrchatPlayerModeration, bypassConfirmation: boolean) {
        if (!bypassConfirmation && !window.confirm(`Continue? Moderation ${row.type}`)) return;
        const key = moderationKey(row);
        setDeletingKey(key);
        setError("");
        try {
            const response = await fetch("/api/moderations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moderated: row.targetUserId, type: row.type }) });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The moderation could not be removed.");
            setModerations((current) => current.filter((item) => moderationKey(item) !== key));
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "The moderation could not be removed.");
        } finally {
            setDeletingKey("");
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col p-2" aria-labelledby="moderation-heading">
            <h1 id="moderation-heading" className="sr-only">
                Moderation
            </h1>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <details className="relative min-w-52 flex-1">
                    <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-input px-3 text-xs [&::-webkit-details-marker]:hidden">
                        <span className="truncate text-muted-foreground">{filters.length ? filters.map((type) => moderationLabels[type] || type).join(", ") : "Filter moderation types"}</span>
                        <ChevronDown className="size-4 shrink-0" />
                    </summary>
                    <div className="absolute top-10 left-0 z-30 max-h-80 w-full min-w-60 overflow-auto rounded-md border border-border bg-popover p-1 shadow-xl">
                        {types.map((type) => (
                            <label key={type} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted">
                                <input type="checkbox" checked={filters.includes(type)} onChange={() => toggleFilter(type)} className="accent-primary" />
                                {moderationLabels[type] || type}
                            </label>
                        ))}
                    </div>
                </details>
                <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                    }}
                    className="h-9 min-w-38 flex-[0.4] rounded-md border border-input bg-background px-3 text-xs"
                    placeholder="Search moderations"
                />
                <button type="button" onClick={() => void refreshModerations()} disabled={loading} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Refresh moderations">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </button>
            </div>
            {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {loading ? (
                    <div className="flex min-h-64 items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading moderations" />
                    </div>
                ) : null}
                {!loading && !visible.length ? <div className="flex min-h-64 items-center justify-center text-xs text-muted-foreground">No data</div> : null}
                {!loading && visible.length ? (
                    <table className="w-full min-w-[685px] table-fixed text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                            <tr>
                                <th className="w-5" />
                                <th className="w-[120px] px-2 py-2">
                                    <button type="button" onClick={() => setAscending((value) => !value)} className="inline-flex items-center gap-1 hover:text-foreground">
                                        Date <ArrowUpDown className="size-3.5" />
                                    </button>
                                </th>
                                <th className="w-[140px] px-2 py-2">Type</th>
                                <th className="w-[120px] px-2 py-2">Source</th>
                                <th className="px-2 py-2">Target</th>
                                <th className="w-20 px-2 py-2 text-right">Action</th>
                                <th className="w-[5px]" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row) => {
                                const key = moderationKey(row);
                                return (
                                    <tr key={key} className="hover:bg-muted/50">
                                        <td className="border-t border-border" />
                                        <td className="whitespace-nowrap border-t border-border px-2 py-2 text-muted-foreground" title={formatDate(row.created, true)}>
                                            {formatDate(row.created)}
                                        </td>
                                        <td className="border-t border-border px-2 py-2">
                                            <span className="inline-flex max-w-full rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{moderationLabels[row.type] || row.type}</span>
                                        </td>
                                        <td className="border-t border-border px-2 py-2">
                                            <button type="button" onClick={() => openUser(row.sourceUserId)} className="block w-full truncate text-left hover:text-primary">
                                                {row.sourceDisplayName || row.sourceUserId}
                                            </button>
                                        </td>
                                        <td className="border-t border-border px-2 py-2">
                                            <button type="button" onClick={() => openUser(row.targetUserId)} className="block w-full whitespace-normal wrap-break-word text-left hover:text-primary">
                                                {row.targetDisplayName || row.targetUserId}
                                            </button>
                                        </td>
                                        <td className="border-t border-border px-2 py-2 text-right">
                                            {row.sourceUserId === currentUser.id ? (
                                                <button
                                                    type="button"
                                                    onClick={(event) => void deleteModeration(row, event.shiftKey)}
                                                    disabled={deletingKey === key}
                                                    className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                                    aria-label={`Remove ${moderationLabels[row.type] || row.type} moderation`}
                                                    title={shiftHeld ? "Remove without confirmation" : "Remove moderation"}
                                                >
                                                    {deletingKey === key ? <Loader2 className="size-4 animate-spin" /> : shiftHeld ? <X className="size-4 text-red-600" /> : <Trash2 className="size-4" />}
                                                </button>
                                            ) : null}
                                        </td>
                                        <td className="border-t border-border" />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
                <span>
                    {filtered.length} moderation{filtered.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1">
                        Rows{" "}
                        <select value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)} className="h-7 rounded border border-input bg-background px-1 text-[10px]">
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </label>
                    <span>
                        {safePage + 1} / {pageCount}
                    </span>
                    <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Previous page">
                        <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage + 1 >= pageCount} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40" aria-label="Next page">
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            </div>
        </section>
    );
}
