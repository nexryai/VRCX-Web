"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { ArrowDown, ArrowUp, Clock3, Loader2, MapPin, Search, X } from "lucide-react";

import { type PreviousInstanceRow, type PreviousInstancesVariant, previousInstancesResponseSchema } from "@/lib/previous-instances";

type SortKey = "date" | "time";

export function PreviousInstancesDialog({ variant, entityId, label, onClose, returnFocusRef }: { variant: PreviousInstancesVariant; entityId: string; label: string; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
    const [rows, setRows] = useState<PreviousInstanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(0);
    const [sortKey, setSortKey] = useState<SortKey>("date");
    const [descending, setDescending] = useState(true);
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`/api/previous-instances?variant=${variant}&id=${encodeURIComponent(entityId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const payload: unknown = await response.json();
                if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Previous instances could not be loaded.");
                const parsed = previousInstancesResponseSchema.safeParse(payload);
                if (!parsed.success) throw new Error("The previous-instances response was not valid.");
                setRows(parsed.data.rows);
            })
            .catch((requestError) => {
                if (requestError instanceof DOMException && requestError.name === "AbortError") return;
                setError(requestError instanceof Error ? requestError.message : "Previous instances could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        closeButton.current?.focus();
        return () => {
            controller.abort();
            returnFocusRef?.current?.focus();
        };
    }, [entityId, returnFocusRef, variant]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose();
        }
        window.addEventListener("keydown", closeOnEscape, { capture: true });
        return () => window.removeEventListener("keydown", closeOnEscape, { capture: true });
    }, [onClose]);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const visible = query ? rows.filter((row) => `${row.worldName || ""} ${row.groupName || ""} ${row.creatorName || ""} ${row.creatorId || ""} ${row.location} ${row.worldId} ${row.instanceId}`.toLocaleLowerCase().includes(query)) : [...rows];
        return visible.toSorted((left, right) => {
            const comparison = sortKey === "time" ? left.durationMs - right.durationMs : left.startedAt.localeCompare(right.startedAt);
            return (descending ? -comparison : comparison) || right.id.localeCompare(left.id);
        });
    }, [descending, rows, search, sortKey]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const visibleRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    function toggleSort(key: SortKey) {
        if (sortKey === key) setDescending((value) => !value);
        else {
            setSortKey(key);
            setDescending(true);
        }
        setPage(0);
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close previous instances" />
            <section role="dialog" aria-modal="true" aria-labelledby="previous-instances-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background shadow-2xl sm:h-[min(90dvh,720px)] sm:max-w-[980px] sm:rounded-xl sm:border">
                <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                    <div className="min-w-0">
                        <h2 id="previous-instances-title" className="font-semibold">
                            Previous Instances
                        </h2>
                        <p className="truncate text-xs text-muted-foreground">{label}</p>
                    </div>
                    <button ref={closeButton} type="button" onClick={onClose} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col p-3">
                    <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                            Remote observations only · {filtered.length} {filtered.length === 1 ? "instance" : "instances"}
                        </p>
                        <label className="relative block w-full sm:w-64">
                            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <span className="sr-only">Search previous instances</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(0);
                                }}
                                placeholder="Search"
                                className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-7 text-xs outline-none focus:border-ring"
                            />
                        </label>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                        {loading ? (
                            <div className="flex min-h-64 items-center justify-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" /> Loading previous instances…
                            </div>
                        ) : null}
                        {!loading && error ? <div className="flex min-h-64 items-center justify-center p-4 text-xs text-destructive">{error}</div> : null}
                        {!loading && !error && !visibleRows.length ? <div className="flex min-h-64 items-center justify-center text-xs text-muted-foreground">No remotely observed instances.</div> : null}
                        {!loading && !error && visibleRows.length ? (
                            <table className="w-full min-w-[720px] table-fixed text-left text-xs">
                                <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                                    <tr className="border-b border-border">
                                        <SortableHeader label="Date" active={sortKey === "date"} descending={descending} onClick={() => toggleSort("date")} className="w-44" />
                                        <th className="px-3 py-2 font-medium">{variant === "user" ? "World" : "Instance Name"}</th>
                                        {variant !== "group" ? <th className="w-48 px-3 py-2 font-medium">Instance Creator</th> : null}
                                        <SortableHeader label="Time" active={sortKey === "time"} descending={descending} onClick={() => toggleSort("time")} className="w-32" />
                                        <th className="w-40 px-3 py-2 font-medium">Observation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleRows.map((row) => (
                                        <PreviousInstanceTableRow key={row.id} row={row} variant={variant} />
                                    ))}
                                </tbody>
                            </table>
                        ) : null}
                    </div>

                    <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
                        <label className="flex items-center gap-2 text-muted-foreground">
                            Rows
                            <select
                                value={pageSize}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value));
                                    setPage(0);
                                }}
                                className="h-8 rounded border border-input bg-background px-2 text-foreground"
                            >
                                {[10, 25, 50, 100].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                                Page {currentPage + 1} of {pageCount}
                            </span>
                            <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} className="h-8 rounded border border-input px-3 disabled:opacity-40">
                                Previous
                            </button>
                            <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1} className="h-8 rounded border border-input px-3 disabled:opacity-40">
                                Next
                            </button>
                        </div>
                    </footer>
                </div>
            </section>
        </div>
    );
}

function SortableHeader({ label, active, descending, onClick, className }: { label: string; active: boolean; descending: boolean; onClick: () => void; className?: string }) {
    return (
        <th className={`px-1 py-1 font-medium ${className || ""}`}>
            <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1 rounded px-2 hover:bg-muted">
                {label}
                {active ? descending ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" /> : null}
            </button>
        </th>
    );
}

function PreviousInstanceTableRow({ row, variant }: { row: PreviousInstanceRow; variant: PreviousInstancesVariant }) {
    return (
        <tr className="border-b border-border/70 last:border-0 hover:bg-muted/40">
            <td className="px-3 py-2 align-top">{formatDate(row.startedAt)}</td>
            <td className="px-3 py-2 align-top">
                <span className="flex min-w-0 items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                        <span className="block truncate font-medium">{row.worldName || row.worldId}</span>
                        {row.groupName ? <span className="block truncate text-[10px] text-muted-foreground">{row.groupName}</span> : null}
                        <span className="block truncate font-mono text-[10px] text-muted-foreground" title={row.location}>
                            {row.instanceId}
                        </span>
                    </span>
                </span>
            </td>
            {variant !== "group" ? <td className="truncate px-3 py-2 align-top">{row.creatorName || row.creatorId || (row.groupId ? "Group instance" : "Public")}</td> : null}
            <td className="px-3 py-2 align-top">
                <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3.5 text-muted-foreground" />
                    {formatDuration(row.durationMs)}
                </span>
            </td>
            <td className="px-3 py-2 align-top">
                <span className="flex flex-wrap gap-1">
                    {row.current ? <Badge>Current</Badge> : null}
                    {row.observationCount > 1 ? <Badge>{row.observationCount} visits</Badge> : null}
                    <Badge>{row.source === "active-account-session" ? "You" : "Remote user"}</Badge>
                    <Badge>{row.startPrecision === "upstream" && row.endPrecision === "upstream" ? "Exact" : "Observed"}</Badge>
                </span>
            </td>
        </tr>
    );
}

function Badge({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex h-5 items-center rounded border border-border px-1.5 text-[10px] text-muted-foreground">{children}</span>;
}

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDuration(milliseconds: number) {
    if (milliseconds <= 0) return "—";
    const minutes = Math.floor(milliseconds / 60_000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days) return `${days}d ${hours % 24}h`;
    if (hours) return `${hours}h ${minutes % 60}m`;
    return `${Math.max(1, minutes)}m`;
}
