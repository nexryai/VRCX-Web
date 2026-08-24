"use client";

import { useEffect, useState } from "react";

import { Loader2, Trash2, User } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import { ToolsDialogFrame } from "@/components/tools/tools-dialog-frame";
import { VrchatImage } from "@/components/vrchat-image";
import { type NoteExportCandidate, type NoteExportResponse, noteExportResponseSchema } from "@/lib/note-export";

const warnings = [
    "This process will export all of your VRCX memos and import them into VRChat notes.",
    "Be warned of the following limitations:",
    "- API endpoint has a rate limit that requires a large delay between requests.",
    "- Character limit of 256 per note.",
    "- Swear words filter (no fun allowed).",
    "- No new lines (they will replaced with a space).",
    "- This will overwrite any existing VRChat notes for these users.",
    "- Any edits made here wont affect VRCX memos but will affect VRChat notes once exported.",
];

export function NoteExportDialog({ close }: { close: () => void }) {
    const { openUser } = useFriends();
    const [candidates, setCandidates] = useState<NoteExportCandidate[]>([]);
    const [job, setJob] = useState<NoteExportResponse["job"]>({ status: "complete", processed: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [requestError, setRequestError] = useState("");
    const [errorHidden, setErrorHidden] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const running = job.status === "queued" || job.status === "running";

    useEffect(() => {
        const controller = new AbortController();
        async function poll() {
            setLoading(true);
            try {
                while (!controller.signal.aborted) {
                    const next = await loadState(false, controller.signal, reloadKey);
                    setCandidates(next.candidates);
                    setJob(next.job);
                    setRequestError("");
                    setLoading(false);
                    if (next.job.status !== "queued" && next.job.status !== "running") break;
                    await delay(750, controller.signal);
                }
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "AbortError")) setRequestError(error instanceof Error ? error.message : "The note export could not be loaded.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void poll();
        return () => controller.abort();
    }, [reloadKey]);

    async function refresh() {
        setLoading(true);
        setErrorHidden(false);
        try {
            const next = await loadState(true);
            setCandidates(next.candidates);
            setJob(next.job);
            setRequestError("");
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : "The note export could not be refreshed.");
        } finally {
            setLoading(false);
        }
    }

    async function start() {
        setLoading(true);
        setErrorHidden(false);
        try {
            const response = await fetch("/api/tools/note-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: candidates.map(({ userId, note }) => ({ userId, note })) }) });
            const payload: unknown = await response.json();
            if (!response.ok) throw new Error(readError(payload, "The note export could not be started."));
            setJob({ status: "queued", processed: 0, total: candidates.length });
            setRequestError("");
            setReloadKey((value) => value + 1);
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : "The note export could not be started.");
            setLoading(false);
        }
    }

    async function cancel() {
        try {
            const response = await fetch("/api/tools/note-export", { method: "DELETE" });
            const payload: unknown = await response.json();
            if (!response.ok) throw new Error(readError(payload, "The note export could not be cancelled."));
            setReloadKey((value) => value + 1);
        } catch (error) {
            setRequestError(error instanceof Error ? error.message : "The note export could not be cancelled.");
        }
    }

    function edit(userId: string, note: string) {
        setCandidates((current) => current.map((candidate) => (candidate.userId === userId ? { ...candidate, note: note.replace(/[\r\n]/g, " ").slice(0, 256) } : candidate)));
    }

    const visibleError = errorHidden ? "" : requestError || job.error || "";

    return (
        <ToolsDialogFrame title="Note Export" close={close} wide>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={loading || running} onClick={() => void refresh()} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted disabled:opacity-50">
                    Refresh
                </button>
                <button type="button" disabled={loading || running || candidates.length === 0} onClick={() => void start()} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted disabled:opacity-50">
                    Export
                </button>
                {running ? (
                    <button type="button" onClick={() => void cancel()} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted">
                        Cancel
                    </button>
                ) : null}
                {running ? (
                    <span className="inline-flex items-center text-xs">
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Progress: {job.processed}/{job.total}
                    </span>
                ) : null}
            </div>
            {visibleError ? (
                <div className="mt-3 text-xs">
                    <button type="button" onClick={() => setErrorHidden(true)} className="h-8 rounded-md border border-input px-3 hover:bg-muted">
                        Clear Errors
                    </button>
                    <h3 className="mt-2 font-bold">Errors:</h3>
                    <pre className="mt-1 whitespace-pre-wrap text-destructive">{visibleError}</pre>
                </div>
            ) : null}
            <div className="mt-2 max-h-[500px] min-h-24 overflow-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-popover">
                        <tr className="border-b border-border text-left">
                            <th className="w-[70px] p-2 font-medium">Image</th>
                            <th className="w-[170px] p-2 font-medium">Name</th>
                            <th className="p-2 font-medium">Note</th>
                            <th className="w-[90px] p-2 text-right font-medium">Skip Export</th>
                        </tr>
                    </thead>
                    <tbody>
                        {candidates.map((candidate) => (
                            <tr key={candidate.userId} className="border-b border-border last:border-0">
                                <td className="p-2">
                                    <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-muted">
                                        <VrchatImage src={candidate.imageUrl} alt="" className="size-full object-cover" fallback={<User className="size-4 text-muted-foreground" aria-hidden="true" />} />
                                    </span>
                                </td>
                                <td className="p-2">
                                    <button type="button" onClick={() => openUser(candidate.userId)} className="text-left hover:underline">
                                        {candidate.displayName}
                                    </button>
                                </td>
                                <td className="p-2">
                                    <textarea
                                        value={candidate.note}
                                        maxLength={256}
                                        rows={2}
                                        disabled={running}
                                        onChange={(event) => edit(candidate.userId, event.target.value)}
                                        className="min-h-0 w-full resize-none rounded-md border border-input bg-background px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={`Note for ${candidate.displayName}`}
                                    />
                                    <div className="text-right text-[10px] text-muted-foreground">{candidate.note.length}/256</div>
                                </td>
                                <td className="p-2 text-right">
                                    <button
                                        type="button"
                                        disabled={running}
                                        onClick={() => setCandidates((current) => current.filter((item) => item.userId !== candidate.userId))}
                                        aria-label={`Skip ${candidate.displayName}`}
                                        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
                                    >
                                        <Trash2 className="size-4" aria-hidden="true" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loading && candidates.length === 0 ? <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No user memos need to be exported.</div> : null}
                {loading && candidates.length === 0 ? (
                    <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" /> Loading
                    </div>
                ) : null}
            </div>
        </ToolsDialogFrame>
    );
}

async function loadState(refresh: boolean, signal?: AbortSignal, requestVersion?: number) {
    const query = new URLSearchParams();
    if (refresh) query.set("refresh", "true");
    if (requestVersion !== undefined) query.set("request", String(requestVersion));
    const response = await fetch(`/api/tools/note-export${query.size ? `?${query}` : ""}`, { cache: "no-store", signal });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(readError(payload, "The note export could not be loaded."));
    const parsed = noteExportResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("The note export response was not valid.");
    return parsed.data;
}

function delay(milliseconds: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, milliseconds);
        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timeout);
                reject(new DOMException("The request was aborted.", "AbortError"));
            },
            { once: true },
        );
    });
}

function readError(payload: unknown, fallback: string) {
    return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}
