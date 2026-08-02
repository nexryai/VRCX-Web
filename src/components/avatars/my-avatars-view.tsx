"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Check, ExternalLink, Grid2X2, ImageIcon, List, Loader2, Pencil, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import type { VrchatAvatar } from "@/lib/vrchat/types";

type ReleaseFilter = "all" | "private" | "public";
type PlatformFilter = "all" | "android" | "ios" | "standalonewindows";
type ViewMode = "grid" | "table";
type ConfirmAction = "delete" | "enqueue-impostor" | "select";

async function fetchAvatarPage(offset: number, signal: AbortSignal) {
    const response = await fetch(`/api/avatars?offset=${offset}`, { cache: "no-store", signal });
    const payload = (await response.json()) as { avatars?: VrchatAvatar[]; error?: string };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok || !payload.avatars) throw new Error(payload.error || "Avatars could not be loaded.");
    return payload.avatars;
}

function platformLabels(avatar: VrchatAvatar) {
    const platforms = new Set(avatar.unityPackages?.map((item) => item.platform.toLocaleLowerCase()) || []);
    return [platforms.has("standalonewindows") ? "PC" : "", platforms.has("android") ? "Android" : "", platforms.has("ios") ? "iOS" : ""].filter(Boolean);
}

function formatDate(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function MyAvatarsView() {
    const currentUser = useCurrentUser();
    const [avatars, setAvatars] = useState<VrchatAvatar[]>([]);
    const [currentAvatarId, setCurrentAvatarId] = useState(currentUser.currentAvatar || "");
    const [search, setSearch] = useState("");
    const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [updatingId, setUpdatingId] = useState("");
    const [editing, setEditing] = useState<VrchatAvatar | null>(null);
    const [confirming, setConfirming] = useState<{ action: ConfirmAction; avatar: VrchatAvatar } | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<{ myAvatarsView?: ViewMode }>)
            .then((settings) => {
                if (settings.myAvatarsView === "grid" || settings.myAvatarsView === "table") setViewMode(settings.myAvatarsView);
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, []);

    const loadAvatars = useCallback(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        setError("");
        try {
            const result: VrchatAvatar[] = [];
            for (let offset = 0; offset <= 5_000; offset += 50) {
                const page = await fetchAvatarPage(offset, controller.signal);
                result.push(...page);
                if (page.length < 50) break;
            }
            setAvatars(result);
        } catch (loadError) {
            if (loadError instanceof DOMException && loadError.name === "AbortError") return;
            setError(loadError instanceof Error ? loadError.message : "Avatars could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAvatars();
        return () => controllerRef.current?.abort();
    }, [loadAvatars]);

    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return avatars.filter((avatar) => {
            if (releaseFilter !== "all" && avatar.releaseStatus !== releaseFilter) return false;
            if (platformFilter !== "all" && !avatar.unityPackages?.some((item) => item.platform.toLocaleLowerCase() === platformFilter)) return false;
            return !query || `${avatar.name} ${avatar.description || ""} ${avatar.id}`.toLocaleLowerCase().includes(query);
        });
    }, [avatars, platformFilter, releaseFilter, search]);

    function changeView(mode: ViewMode) {
        setViewMode(mode);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ myAvatarsView: mode }) });
    }

    async function runAction(avatar: VrchatAvatar, action: ConfirmAction) {
        setUpdatingId(avatar.id);
        setError("");
        setNotice("");
        try {
            if (action === "delete") {
                const response = await fetch(`/api/avatars/${avatar.id}`, { method: "DELETE" });
                const payload = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(payload.error || "The avatar could not be deleted.");
                setAvatars((current) => current.filter((item) => item.id !== avatar.id));
                setNotice(`${avatar.name} was deleted.`);
            } else {
                const response = await fetch(`/api/avatars/${avatar.id}/actions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action }),
                });
                const payload = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(payload.error || "The avatar action could not be completed.");
                if (action === "select") {
                    setCurrentAvatarId(avatar.id);
                    setNotice(`${avatar.name} is now selected.`);
                } else {
                    setNotice(`An impostor build was queued for ${avatar.name}.`);
                }
            }
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The avatar action could not be completed.");
        } finally {
            setUpdatingId("");
            setConfirming(null);
        }
    }

    async function saveAvatar(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing) return;
        const form = new FormData(event.currentTarget);
        setUpdatingId(editing.id);
        setError("");
        setNotice("");
        try {
            const response = await fetch(`/api/avatars/${editing.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: form.get("name"), description: form.get("description"), releaseStatus: form.get("releaseStatus") }),
            });
            const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
            if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be updated.");
            setAvatars((current) => current.map((avatar) => (avatar.id === editing.id ? payload.avatar || avatar : avatar)));
            setNotice(`${payload.avatar.name} was updated.`);
            setEditing(null);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The avatar could not be updated.");
        } finally {
            setUpdatingId("");
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col" aria-labelledby="my-avatars-heading">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <span className="inline-flex rounded-md border border-input p-0.5">
                    <button type="button" onClick={() => changeView("grid")} className={`inline-flex size-8 items-center justify-center rounded-sm ${viewMode === "grid" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Grid view" aria-pressed={viewMode === "grid"}>
                        <Grid2X2 aria-hidden="true" className="size-4" />
                    </button>
                    <button type="button" onClick={() => changeView("table")} className={`inline-flex size-8 items-center justify-center rounded-sm ${viewMode === "table" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Table view" aria-pressed={viewMode === "table"}>
                        <List aria-hidden="true" className="size-4" />
                    </button>
                </span>
                <select value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value as ReleaseFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter avatar visibility">
                    <option value="all">All visibility</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                </select>
                <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as PlatformFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter avatar platform">
                    <option value="all">All platforms</option>
                    <option value="standalonewindows">PC</option>
                    <option value="android">Android</option>
                    <option value="ios">iOS</option>
                </select>
                <label className="relative min-w-44 flex-1 sm:max-w-sm">
                    <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus:border-ring" placeholder="Search my avatars" />
                </label>
                <button type="button" onClick={() => void loadAvatars()} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Refresh avatars">
                    <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
                <h1 id="my-avatars-heading" className="sr-only">
                    My Avatars
                </h1>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <ImageIcon aria-hidden="true" className="size-4" />
                    {filtered.length} of {avatars.length} avatars{loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                </div>
                {error ? (
                    <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                        {error}
                    </p>
                ) : null}
                {notice ? (
                    <p className="mb-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary" role="status">
                        {notice}
                    </p>
                ) : null}
                {!loading && !error && filtered.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">No avatars match the current filters.</p> : null}
                {viewMode === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
                        {filtered.map((avatar) => (
                            <AvatarCard key={avatar.id} avatar={avatar} active={currentAvatarId === avatar.id} busy={updatingId === avatar.id} onEdit={setEditing} onConfirm={(action) => setConfirming({ action, avatar })} />
                        ))}
                    </div>
                ) : filtered.length ? (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[780px] text-left text-xs">
                            <thead className="bg-muted text-[10px] tracking-wide text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-3 py-2">Avatar</th>
                                    <th className="px-3 py-2">Visibility</th>
                                    <th className="px-3 py-2">Platforms</th>
                                    <th className="px-3 py-2">Updated</th>
                                    <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((avatar) => (
                                    <AvatarTableRow key={avatar.id} avatar={avatar} active={currentAvatarId === avatar.id} busy={updatingId === avatar.id} onEdit={setEditing} onConfirm={(action) => setConfirming({ action, avatar })} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </div>

            {editing ? <EditAvatarDialog avatar={editing} busy={updatingId === editing.id} onClose={() => setEditing(null)} onSubmit={saveAvatar} /> : null}
            {confirming ? <ConfirmAvatarDialog action={confirming.action} avatar={confirming.avatar} busy={updatingId === confirming.avatar.id} onClose={() => setConfirming(null)} onConfirm={() => runAction(confirming.avatar, confirming.action)} /> : null}
        </section>
    );
}

type AvatarActionsProps = { avatar: VrchatAvatar; active: boolean; busy: boolean; onEdit: (avatar: VrchatAvatar) => void; onConfirm: (action: ConfirmAction) => void };

function AvatarActions({ avatar, active, busy, onEdit, onConfirm }: AvatarActionsProps) {
    return (
        <span className="flex flex-wrap items-center justify-end gap-1">
            <button type="button" onClick={() => onConfirm("select")} disabled={active || busy} className="inline-flex h-8 items-center gap-1 rounded-md bg-secondary px-2 text-[10px] disabled:opacity-50">
                <Check aria-hidden="true" className="size-3.5" />
                {active ? "Selected" : "Wear"}
            </button>
            <button type="button" onClick={() => onEdit(avatar)} disabled={busy} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Edit avatar">
                <Pencil aria-hidden="true" className="size-3.5" />
            </button>
            <button type="button" onClick={() => onConfirm("enqueue-impostor")} disabled={busy} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Create impostor">
                <Sparkles aria-hidden="true" className="size-3.5" />
            </button>
            <button type="button" onClick={() => onConfirm("delete")} disabled={active || busy} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label="Delete avatar">
                {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
            </button>
        </span>
    );
}

function AvatarCard(props: AvatarActionsProps) {
    const { avatar, active } = props;
    return (
        <article className={`overflow-hidden rounded-lg border bg-card hover:bg-muted ${active ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
            <a href={`https://vrchat.com/home/avatar/${encodeURIComponent(avatar.id)}`} target="_blank" rel="noreferrer" className="group block">
                <div className="relative aspect-[5/2] bg-muted">
                    {avatar.thumbnailImageUrl ? (
                        <img src={avatar.thumbnailImageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                        <span className="flex size-full items-center justify-center">
                            <ImageIcon aria-hidden="true" className="size-6 text-muted-foreground" />
                        </span>
                    )}
                    <ExternalLink aria-hidden="true" className="absolute top-2 right-2 size-4 opacity-0 drop-shadow group-hover:opacity-100" />
                </div>
                <div className="p-2">
                    <p className="line-clamp-2 min-h-9 text-sm font-medium">{avatar.name}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                        {avatar.releaseStatus || "Unknown"} · {platformLabels(avatar).join(", ") || "No platform"}
                    </p>
                </div>
            </a>
            <div className="border-t border-border p-2">
                <AvatarActions {...props} />
            </div>
        </article>
    );
}

function AvatarTableRow(props: AvatarActionsProps) {
    const { avatar, active } = props;
    return (
        <tr className={active ? "bg-primary/5" : "hover:bg-muted/60"}>
            <td className="border-t border-border p-2">
                <a href={`https://vrchat.com/home/avatar/${encodeURIComponent(avatar.id)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary">
                    <span className="flex size-9 shrink-0 overflow-hidden rounded-sm bg-muted">{avatar.thumbnailImageUrl ? <img src={avatar.thumbnailImageUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}</span>
                    <span className="max-w-64 truncate font-medium">{avatar.name}</span>
                </a>
            </td>
            <td className="border-t border-border px-3 py-2 capitalize">{avatar.releaseStatus || "Unknown"}</td>
            <td className="border-t border-border px-3 py-2">{platformLabels(avatar).join(", ") || "Unknown"}</td>
            <td className="border-t border-border px-3 py-2 text-muted-foreground">{formatDate(avatar.updated_at)}</td>
            <td className="border-t border-border px-3 py-2">
                <AvatarActions {...props} />
            </td>
        </tr>
    );
}

function EditAvatarDialog({ avatar, busy, onClose, onSubmit }: { avatar: VrchatAvatar; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <form onSubmit={(event) => void onSubmit(event)} className="w-full max-w-lg rounded-xl border border-border bg-background p-4 shadow-2xl" aria-labelledby="edit-avatar-title">
                <div className="flex items-center gap-2">
                    <h2 id="edit-avatar-title" className="text-sm font-semibold">
                        Edit avatar
                    </h2>
                    <button type="button" onClick={onClose} className="ml-auto inline-flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Close">
                        <X aria-hidden="true" className="size-4" />
                    </button>
                </div>
                <label className="mt-4 block text-xs font-medium">
                    Name
                    <input name="name" defaultValue={avatar.name} required maxLength={64} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </label>
                <label className="mt-3 block text-xs font-medium">
                    Description
                    <textarea name="description" defaultValue={avatar.description || ""} maxLength={256} rows={4} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                </label>
                <label className="mt-3 block text-xs font-medium">
                    Visibility
                    <select name="releaseStatus" defaultValue={avatar.releaseStatus === "public" ? "public" : "private"} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                    </select>
                </label>
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="h-9 rounded-md bg-secondary px-3 text-xs">
                        Cancel
                    </button>
                    <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
                        {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}Save
                    </button>
                </div>
            </form>
        </div>
    );
}

function ConfirmAvatarDialog({ action, avatar, busy, onClose, onConfirm }: { action: ConfirmAction; avatar: VrchatAvatar; busy: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
    const labels = { delete: "Delete this avatar permanently?", "enqueue-impostor": "Queue a new impostor build?", select: "Select this avatar?" };
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-3">
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-avatar-title" className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-2xl">
                <h2 id="confirm-avatar-title" className="text-sm font-semibold">
                    {labels[action]}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">{avatar.name}</p>
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-md bg-secondary px-3 text-xs">
                        Cancel
                    </button>
                    <button type="button" onClick={() => void onConfirm()} disabled={busy} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs text-white disabled:opacity-50 ${action === "delete" ? "bg-destructive" : "bg-primary"}`}>
                        {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                        {action === "delete" ? "Delete" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}
