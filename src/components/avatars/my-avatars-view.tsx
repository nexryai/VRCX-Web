"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Apple, ArrowUpDown, Check, ChevronLeft, ChevronRight, Ellipsis, ExternalLink, Grid2X2, ImageIcon, List, ListFilter, Loader2, Monitor, Pencil, RefreshCw, Settings, Smartphone, Sparkles, Tag, User, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import { VrchatImage } from "@/components/vrchat-image";
import type { VrchatAvatar } from "@/lib/vrchat/types";

type ReleaseFilter = "all" | "private" | "public";
type PlatformFilter = "all" | "android" | "ios" | "pc";
type ViewMode = "grid" | "table";
type PageSize = 20 | 50 | 100;
type AvatarTag = { tag: string; color: string | null };
type EditMode = "description" | "name";

const tagPalette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

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

function packagePlatform(platform: string) {
    const value = platform.toLocaleLowerCase();
    if (value === "standalonewindows") return "pc";
    return value;
}

function platforms(avatar: VrchatAvatar) {
    return new Set(avatar.unityPackages?.map((item) => packagePlatform(item.platform)) || []);
}

function performance(avatar: VrchatAvatar, platform: Exclude<PlatformFilter, "all">) {
    return avatar.unityPackages?.findLast((item) => packagePlatform(item.platform) === platform)?.performanceRating || "";
}

function impostorVersion(avatar: VrchatAvatar) {
    const item = avatar.unityPackages?.findLast((entry) => entry.variant === "impostor");
    return item?.impostorizerVersion ? `v${item.impostorizerVersion}` : "-";
}

function timestamp(value?: string) {
    const result = Date.parse(value || "");
    return Number.isNaN(result) ? 0 : result;
}

function formatDate(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function hashColor(tag: string) {
    let hash = 0;
    for (const character of tag) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    return tagPalette[Math.abs(hash) % tagPalette.length];
}

export function MyAvatarsView() {
    const currentUser = useCurrentUser();
    const { openAvatar } = useFriends();
    const [avatars, setAvatars] = useState<VrchatAvatar[]>([]);
    const [tagsByAvatar, setTagsByAvatar] = useState<Record<string, AvatarTag[]>>({});
    const [currentAvatarId, setCurrentAvatarId] = useState(currentUser.currentAvatar || "");
    const [search, setSearch] = useState("");
    const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [cardScale, setCardScale] = useState(0.6);
    const [cardSpacing, setCardSpacing] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(20);
    const [page, setPage] = useState(0);
    const [sortKey, setSortKey] = useState<"created" | "name" | "updated" | "version">("updated");
    const [ascending, setAscending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [updatingId, setUpdatingId] = useState("");
    const [editing, setEditing] = useState<{ avatar: VrchatAvatar; mode: EditMode } | null>(null);
    const [managingTags, setManagingTags] = useState<VrchatAvatar | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void Promise.all([
            fetch("/api/settings", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((settings: { myAvatarsView?: ViewMode; myAvatarsCardScale?: number; myAvatarsCardSpacing?: number; myAvatarsTablePageSize?: PageSize }) => {
                    if (settings.myAvatarsView === "grid" || settings.myAvatarsView === "table") setViewMode(settings.myAvatarsView);
                    setCardScale(settings.myAvatarsCardScale ?? 0.6);
                    setCardSpacing(settings.myAvatarsCardSpacing ?? 1);
                    setPageSize(settings.myAvatarsTablePageSize ?? 20);
                }),
            fetch("/api/avatar-tags", { cache: "no-store", signal: controller.signal })
                .then((response) => response.json())
                .then((payload: { tags?: Record<string, AvatarTag[]> }) => setTagsByAvatar(payload.tags || {})),
        ]).catch(() => undefined);
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
                const next = await fetchAvatarPage(offset, controller.signal);
                result.push(...next);
                if (next.length < 50) break;
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

    const allTags = useMemo(() => Array.from(new Set(Object.values(tagsByAvatar).flatMap((entries) => entries.map((entry) => entry.tag)))).toSorted(), [tagsByAvatar]);
    const filtered = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return avatars
            .filter((avatar) => {
                const tags = tagsByAvatar[avatar.id] || [];
                if (releaseFilter !== "all" && avatar.releaseStatus !== releaseFilter) return false;
                if (platformFilter !== "all" && !platforms(avatar).has(platformFilter)) return false;
                if (tagFilters.length && !tags.some((entry) => tagFilters.includes(entry.tag))) return false;
                return !query || avatar.name.toLocaleLowerCase().includes(query) || tags.some((entry) => entry.tag.toLocaleLowerCase().includes(query));
            })
            .toSorted((left, right) => {
                const multiplier = ascending ? 1 : -1;
                if (sortKey === "name") return multiplier * left.name.localeCompare(right.name);
                if (sortKey === "version") return multiplier * ((left.version || 0) - (right.version || 0));
                return multiplier * (timestamp(sortKey === "created" ? left.created_at : left.updated_at) - timestamp(sortKey === "created" ? right.created_at : right.updated_at));
            });
    }, [ascending, avatars, platformFilter, releaseFilter, search, sortKey, tagFilters, tagsByAvatar]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const visibleRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
    const activeFilterCount = Number(releaseFilter !== "all") + Number(platformFilter !== "all") + tagFilters.length;
    const gridStyle = { gridTemplateColumns: `repeat(auto-fill,minmax(min(100%,${Math.round(200 * cardScale)}px),1fr))`, gap: `${Math.max(4, Math.round(12 * cardSpacing))}px` };

    function updateSettings(settings: object) {
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    }

    function changeView(myAvatarsView: ViewMode) {
        setViewMode(myAvatarsView);
        updateSettings({ myAvatarsView });
    }

    function toggleTag(tag: string) {
        setTagFilters((current) => (current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]));
        setPage(0);
    }

    async function mutateAvatar(avatar: VrchatAvatar, body: object, success: string) {
        setUpdatingId(avatar.id);
        setError("");
        try {
            const response = await fetch(`/api/avatars/${avatar.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
            if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be updated.");
            setAvatars((current) => current.map((item) => (item.id === avatar.id ? payload.avatar || item : item)));
            setNotice(success);
            return true;
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The avatar could not be updated.");
            return false;
        } finally {
            setUpdatingId("");
        }
    }

    async function runAction(avatar: VrchatAvatar, action: "impostor" | "select") {
        const question = action === "select" ? `Select this avatar?\n${avatar.name}` : "Create an impostor for this avatar?";
        if (!window.confirm(question)) return;
        setUpdatingId(avatar.id);
        setError("");
        try {
            const response = await fetch(`/api/avatars/${avatar.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: action === "select" ? "select" : "enqueue-impostor" }) });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The avatar action could not be completed.");
            if (action === "select") setCurrentAvatarId(avatar.id);
            setNotice(action === "select" ? `${avatar.name} is now selected.` : `An impostor build was queued for ${avatar.name}.`);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The avatar action could not be completed.");
        } finally {
            setUpdatingId("");
        }
    }

    async function saveEdit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing) return;
        const value = String(new FormData(event.currentTarget).get("value") || "").trim();
        if (!value) return;
        const ok = await mutateAvatar(editing.avatar, editing.mode === "name" ? { name: value } : { description: value }, `${editing.avatar.name} was updated.`);
        if (ok) setEditing(null);
    }

    async function saveTags(avatar: VrchatAvatar, tags: AvatarTag[]) {
        setUpdatingId(avatar.id);
        const response = await fetch("/api/avatar-tags", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarId: avatar.id, tags }) });
        const payload = (await response.json()) as { tags?: AvatarTag[]; error?: string };
        if (response.ok && payload.tags) {
            setTagsByAvatar((current) => ({ ...current, [avatar.id]: payload.tags || [] }));
            setManagingTags(null);
        } else setError(payload.error || "Avatar tags could not be saved.");
        setUpdatingId("");
    }

    function showDetails(avatar: VrchatAvatar) {
        openAvatar(avatar.id);
    }

    return (
        <section className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4 overflow-hidden p-2" aria-labelledby="my-avatars-heading">
            <h1 id="my-avatars-heading" className="sr-only">
                My Avatars
            </h1>
            <div className="flex flex-wrap items-center gap-2 px-0.5 pt-1.5">
                <span className="inline-flex rounded-md border border-input p-0.5">
                    <button type="button" onClick={() => changeView("grid")} className={`inline-flex size-7 items-center justify-center rounded-sm ${viewMode === "grid" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Grid view">
                        <Grid2X2 className="size-4" />
                    </button>
                    <button type="button" onClick={() => changeView("table")} className={`inline-flex size-7 items-center justify-center rounded-sm ${viewMode === "table" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Table view">
                        <List className="size-4" />
                    </button>
                </span>
                <details className="relative">
                    <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input px-3 text-xs [&::-webkit-details-marker]:hidden">
                        <ListFilter className="size-4" /> Filter {activeFilterCount ? <span className="rounded-full bg-secondary px-1.5">{activeFilterCount}</span> : null}
                    </summary>
                    <div className="absolute top-9 left-0 z-30 w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover p-3 text-xs shadow-xl">
                        <FilterButtons label="Visibility" values={["all", "public", "private"]} selected={releaseFilter} select={(value) => setReleaseFilter(value as ReleaseFilter)} />
                        <FilterButtons label="Platform" values={["all", "pc", "android", "ios"]} selected={platformFilter} select={(value) => setPlatformFilter(value as PlatformFilter)} />
                        {allTags.length ? (
                            <div className="mt-3">
                                <span className="font-medium">Tags</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {allTags.map((tag) => (
                                        <button type="button" key={tag} onClick={() => toggleTag(tag)} className="rounded border px-2 py-0.5" style={{ borderColor: hashColor(tag), color: tagFilters.includes(tag) ? "white" : hashColor(tag), backgroundColor: tagFilters.includes(tag) ? hashColor(tag) : "transparent" }}>
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {activeFilterCount ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setReleaseFilter("all");
                                    setPlatformFilter("all");
                                    setTagFilters([]);
                                }}
                                className="mt-3 h-8 w-full rounded border border-input"
                            >
                                Clear filters
                            </button>
                        ) : null}
                    </div>
                </details>
                <span className="min-w-2 flex-1" />
                {loading ? <span className="text-xs text-muted-foreground">Loading more</span> : null}
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-3 text-xs sm:max-w-80" placeholder="Search" />
                {viewMode === "grid" ? (
                    <details className="relative">
                        <summary className="inline-flex size-8 cursor-pointer list-none items-center justify-center rounded-full hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Avatar card appearance">
                            <Settings className="size-4" />
                        </summary>
                        <div className="absolute top-9 right-0 z-30 w-60 rounded-md border border-border bg-popover p-3 shadow-xl">
                            <RangeSetting
                                label="Scale"
                                value={cardScale}
                                min={0.3}
                                max={0.9}
                                step={0.01}
                                changed={(value) => {
                                    setCardScale(value);
                                    updateSettings({ myAvatarsCardScale: value });
                                }}
                            />
                            <RangeSetting
                                label="Spacing"
                                value={cardSpacing}
                                min={0.5}
                                max={1.5}
                                step={0.05}
                                changed={(value) => {
                                    setCardSpacing(value);
                                    updateSettings({ myAvatarsCardSpacing: value });
                                }}
                            />
                        </div>
                    </details>
                ) : null}
                <button type="button" onClick={() => void loadAvatars()} disabled={loading} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Refresh avatars">
                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 overflow-auto py-2">
                {error ? <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                {notice ? <p className="mb-2 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary">{notice}</p> : null}
                {!loading && !filtered.length ? <div className="grid min-h-60 place-items-center text-sm">No matching data</div> : null}
                {viewMode === "grid" && filtered.length ? (
                    <div className="grid p-1" style={gridStyle}>
                        {filtered.map((avatar) => (
                            <AvatarCard
                                key={avatar.id}
                                avatar={avatar}
                                tags={tagsByAvatar[avatar.id] || []}
                                scale={cardScale}
                                active={avatar.id === currentAvatarId}
                                busy={updatingId === avatar.id}
                                wear={() => void runAction(avatar, "select")}
                                details={() => showDetails(avatar)}
                                manageTags={() => setManagingTags(avatar)}
                                edit={(mode) => setEditing({ avatar, mode })}
                                visibility={() => void mutateAvatar(avatar, { releaseStatus: avatar.releaseStatus === "public" ? "private" : "public" }, `${avatar.name} visibility was updated.`)}
                                impostor={() => void runAction(avatar, "impostor")}
                            />
                        ))}
                    </div>
                ) : null}
                {viewMode === "table" && filtered.length ? (
                    <AvatarTable
                        avatars={visibleRows}
                        tagsByAvatar={tagsByAvatar}
                        currentAvatarId={currentAvatarId}
                        busyId={updatingId}
                        sort={(key) => {
                            if (sortKey === key) setAscending((value) => !value);
                            else {
                                setSortKey(key);
                                setAscending(key === "name");
                            }
                        }}
                        details={showDetails}
                        wear={(avatar) => void runAction(avatar, "select")}
                        manageTags={setManagingTags}
                        edit={(avatar, mode) => setEditing({ avatar, mode })}
                        visibility={(avatar) => void mutateAvatar(avatar, { releaseStatus: avatar.releaseStatus === "public" ? "private" : "public" }, `${avatar.name} visibility was updated.`)}
                        impostor={(avatar) => void runAction(avatar, "impostor")}
                    />
                ) : null}
                {viewMode === "table" ? (
                    <Pagination
                        total={filtered.length}
                        page={safePage}
                        pageCount={pageCount}
                        pageSize={pageSize}
                        setPage={setPage}
                        setPageSize={(value) => {
                            setPageSize(value);
                            setPage(0);
                            updateSettings({ myAvatarsTablePageSize: value });
                        }}
                    />
                ) : null}
            </div>
            {editing ? <EditDialog editing={editing} busy={updatingId === editing.avatar.id} close={() => setEditing(null)} save={saveEdit} /> : null}
            {managingTags ? <TagsDialog avatar={managingTags} initial={tagsByAvatar[managingTags.id] || []} busy={updatingId === managingTags.id} close={() => setManagingTags(null)} save={(tags) => void saveTags(managingTags, tags)} /> : null}
        </section>
    );
}

function FilterButtons({ label, values, selected, select }: { label: string; values: string[]; selected: string; select: (value: string) => void }) {
    return (
        <div className="mt-2 first:mt-0">
            <span className="font-medium">{label}</span>
            <div className="mt-1 flex flex-wrap">
                {values.map((value) => (
                    <button type="button" key={value} onClick={() => select(value)} className={`h-8 border border-input px-2.5 capitalize first:rounded-l-md last:rounded-r-md ${selected === value ? "bg-muted" : ""}`}>
                        {value === "pc" ? "PC" : value}
                    </button>
                ))}
            </div>
        </div>
    );
}

function RangeSetting({ label, value, min, max, step, changed }: { label: string; value: number; min: number; max: number; step: number; changed: (value: number) => void }) {
    return (
        <label className="mb-3 block text-xs last:mb-0">
            <span className="flex justify-between font-medium">
                <span>{label}</span>
                <span>{Math.round(value * 100)}%</span>
            </span>
            <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => changed(Number(event.target.value))} className="mt-1 w-full accent-primary" />
        </label>
    );
}

type CardProps = { avatar: VrchatAvatar; tags: AvatarTag[]; scale: number; active: boolean; busy: boolean; wear: () => void; details: () => void; manageTags: () => void; edit: (mode: EditMode) => void; visibility: () => void; impostor: () => void };

function AvatarCard(props: CardProps) {
    const { avatar, tags, scale, active, busy, wear } = props;
    const available = platforms(avatar);
    return (
        <article onClick={wear} className={`relative cursor-pointer overflow-hidden rounded-lg border hover:bg-muted hover:shadow-sm ${active ? "border-primary ring-1 ring-primary/50" : "border-border/50"}`}>
            <div className="relative aspect-[5/2] overflow-hidden bg-muted">
                <VrchatImage
                    src={avatar.thumbnailImageUrl}
                    alt={avatar.name}
                    className="size-full object-cover [filter:saturate(.8)_contrast(.8)] hover:[filter:saturate(1)_contrast(1)]"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    fallback={
                        <span className="grid size-full place-items-center">
                            <ImageIcon className="size-6 text-muted-foreground" />
                        </span>
                    }
                />
                <PlatformDots available={available} />
                <ActionMenu {...props} />
                {busy ? (
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                        <Loader2 className="size-5 animate-spin" />
                    </span>
                ) : null}
            </div>
            <div className="flex min-h-0 flex-col gap-0.5" style={{ padding: `${Math.round(6 * scale)}px ${Math.round(8 * scale)}px` }}>
                <span className="line-clamp-2 block min-h-[2.75em] overflow-hidden leading-snug" style={{ fontSize: `${Math.max(9, Math.round(18 * scale))}px` }}>
                    {avatar.name}
                </span>
                {tags.length ? <TagBadges tags={tags} compact /> : null}
            </div>
        </article>
    );
}

function PlatformDots({ available }: { available: Set<string> }) {
    if (!available.has("android") && !available.has("ios")) return null;
    return (
        <span className="absolute top-1 right-9 flex -space-x-1">
            {available.has("pc") ? <i className="size-2.5 rounded-full border bg-blue-500 opacity-70" /> : null}
            {available.has("android") ? <i className="size-2.5 rounded-full border bg-green-500 opacity-70" /> : null}
            {available.has("ios") ? <i className="size-2.5 rounded-full border bg-slate-300 opacity-70" /> : null}
        </span>
    );
}

function ActionMenu(props: CardProps & { table?: boolean }) {
    const { avatar, active, wear, details, manageTags, edit, visibility, impostor, table = false } = props;
    return (
        <details className={table ? "relative" : "absolute top-1 right-1"} onClick={(event) => event.stopPropagation()}>
            <summary className="inline-flex size-7 cursor-pointer list-none items-center justify-center rounded-full bg-background/70 hover:bg-background [&::-webkit-details-marker]:hidden" aria-label={`Manage ${avatar.name}`}>
                <Ellipsis className="size-4" />
            </summary>
            <div className={`absolute z-30 w-52 rounded-md border border-border bg-popover p-1 text-xs shadow-xl ${table ? "top-8 right-0" : "top-8 right-0"}`}>
                <MenuButton icon={<ExternalLink />} label="View details" action={details} />
                <MenuButton icon={<Check />} label="Wear avatar" action={wear} disabled={active} />
                <hr className="my-1 border-border" />
                <MenuButton icon={<Tag />} label="Manage tags" action={manageTags} />
                <hr className="my-1 border-border" />
                <MenuButton icon={<User />} label={avatar.releaseStatus === "public" ? "Make private" : "Make public"} action={visibility} />
                <MenuButton icon={<Pencil />} label="Rename" action={() => edit("name")} />
                <MenuButton icon={<Pencil />} label="Change description" action={() => edit("description")} />
                <MenuButton icon={<ExternalLink />} label="Change content tags" action={details} />
                <MenuButton icon={<ExternalLink />} label="Change styles/author tags" action={details} />
                <MenuButton icon={<Sparkles />} label="Create impostor" action={impostor} />
            </div>
        </details>
    );
}

function MenuButton({ icon, label, action, disabled = false }: { icon: React.ReactNode; label: string; action: () => void; disabled?: boolean }) {
    return (
        <button type="button" onClick={action} disabled={disabled} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted disabled:opacity-40">
            <span className="[&>svg]:size-4">{icon}</span>
            {label}
        </button>
    );
}

function TagBadges({ tags, compact = false }: { tags: AvatarTag[]; compact?: boolean }) {
    return (
        <span className={`flex gap-1 overflow-hidden ${compact ? "flex-nowrap" : "flex-wrap"}`}>
            {tags.map((entry) => (
                <span key={entry.tag} className="shrink-0 rounded-sm border px-1 py-0 text-[10px]" style={{ borderColor: entry.color || hashColor(entry.tag), color: entry.color || hashColor(entry.tag) }}>
                    {entry.tag}
                </span>
            ))}
        </span>
    );
}

type TableProps = {
    avatars: VrchatAvatar[];
    tagsByAvatar: Record<string, AvatarTag[]>;
    currentAvatarId: string;
    busyId: string;
    sort: (key: "created" | "name" | "updated" | "version") => void;
    details: (avatar: VrchatAvatar) => void;
    wear: (avatar: VrchatAvatar) => void;
    manageTags: (avatar: VrchatAvatar) => void;
    edit: (avatar: VrchatAvatar, mode: EditMode) => void;
    visibility: (avatar: VrchatAvatar) => void;
    impostor: (avatar: VrchatAvatar) => void;
};

function AvatarTable(props: TableProps) {
    return (
        <div className="min-h-0 overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[1480px] table-fixed text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
                    <tr>
                        <th className="w-10" />
                        <th className="w-16" />
                        <SortHeader label="Name" width="w-50" action={() => props.sort("name")} />
                        <th className="w-38 px-2 py-2">Tags</th>
                        <th className="w-30 px-2 py-2">Platform</th>
                        <th className="w-30 px-2 py-2">Visibility</th>
                        <SortHeader label="Version" width="w-22" action={() => props.sort("version")} />
                        <th className="w-24 px-2 py-2">Impostor</th>
                        <th className="w-30 px-2 py-2">PC performance</th>
                        <th className="w-34 px-2 py-2">Android performance</th>
                        <th className="w-30 px-2 py-2">iOS performance</th>
                        <SortHeader label="Last updated" width="w-40" action={() => props.sort("updated")} />
                        <SortHeader label="Created" width="w-40" action={() => props.sort("created")} />
                        <th className="w-16" />
                    </tr>
                </thead>
                <tbody>
                    {props.avatars.map((avatar) => {
                        const available = platforms(avatar);
                        const cardProps: CardProps = {
                            avatar,
                            tags: props.tagsByAvatar[avatar.id] || [],
                            scale: 0.6,
                            active: avatar.id === props.currentAvatarId,
                            busy: props.busyId === avatar.id,
                            wear: () => props.wear(avatar),
                            details: () => props.details(avatar),
                            manageTags: () => props.manageTags(avatar),
                            edit: (mode) => props.edit(avatar, mode),
                            visibility: () => props.visibility(avatar),
                            impostor: () => props.impostor(avatar),
                        };
                        return (
                            <tr key={avatar.id} onClick={() => props.details(avatar)} className={`cursor-pointer hover:bg-muted/50 ${cardProps.active ? "bg-primary/10" : ""}`}>
                                <td className="border-t border-border text-center">{cardProps.active ? <Check className="mx-auto size-4 text-primary" /> : null}</td>
                                <td className="border-t border-border px-2">
                                    <VrchatImage
                                        src={avatar.thumbnailImageUrl}
                                        alt=""
                                        className="h-[22px] w-[34px] rounded-sm object-cover [filter:saturate(.8)_contrast(.8)]"
                                        fallback={
                                            <span className="grid h-[22px] w-[34px] place-items-center rounded-sm bg-muted">
                                                <ImageIcon className="size-3" />
                                            </span>
                                        }
                                    />
                                </td>
                                <td className="border-t border-border px-2 py-2">{avatar.name}</td>
                                <td className="border-t border-border px-2 py-2">
                                    <TagBadges tags={cardProps.tags} compact />
                                </td>
                                <td className="border-t border-border px-2 py-2">
                                    <PlatformIcons available={available} />
                                </td>
                                <td className="border-t border-border px-2 py-2">
                                    <span className="rounded border border-border px-2 py-0.5 capitalize">{avatar.releaseStatus || "private"}</span>
                                </td>
                                <td className="border-t border-border px-2 py-2 text-right">{avatar.version ?? "-"}</td>
                                <td className="border-t border-border px-2 py-2 text-right">{impostorVersion(avatar)}</td>
                                <td className="border-t border-border px-2 py-2">{performance(avatar, "pc") || "-"}</td>
                                <td className="border-t border-border px-2 py-2">{performance(avatar, "android") || "-"}</td>
                                <td className="border-t border-border px-2 py-2">{performance(avatar, "ios") || "-"}</td>
                                <td className="border-t border-border px-2 py-2">{formatDate(avatar.updated_at)}</td>
                                <td className="border-t border-border px-2 py-2">{formatDate(avatar.created_at)}</td>
                                <td className="border-t border-border px-2" onClick={(event) => event.stopPropagation()}>
                                    <ActionMenu {...cardProps} table />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function SortHeader({ label, width, action }: { label: string; width: string; action: () => void }) {
    return (
        <th className={`${width} px-2 py-2`}>
            <button type="button" onClick={action} className="inline-flex items-center gap-1">
                {label}
                <ArrowUpDown className="size-3.5" />
            </button>
        </th>
    );
}

function PlatformIcons({ available }: { available: Set<string> }) {
    return (
        <span className="flex gap-1">
            {available.has("pc") ? (
                <span className="rounded border border-blue-500 p-1 text-blue-500">
                    <Monitor className="size-3.5" />
                </span>
            ) : null}
            {available.has("android") ? (
                <span className="rounded border border-green-500 p-1 text-green-500">
                    <Smartphone className="size-3.5" />
                </span>
            ) : null}
            {available.has("ios") ? (
                <span className="rounded border border-slate-300 p-1 text-slate-300">
                    <Apple className="size-3.5" />
                </span>
            ) : null}
        </span>
    );
}

function Pagination({ total, page, pageCount, pageSize, setPage, setPageSize }: { total: number; page: number; pageCount: number; pageSize: PageSize; setPage: (page: number) => void; setPageSize: (size: PageSize) => void }) {
    return (
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span>{total} avatars</span>
            <span className="flex items-center gap-2">
                Rows{" "}
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as PageSize)} className="h-7 rounded border border-input bg-background px-1">
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
                <span>
                    {page + 1} / {pageCount}
                </span>
                <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={!page} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40">
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page + 1 >= pageCount} className="inline-flex size-7 items-center justify-center rounded border border-input disabled:opacity-40">
                    <ChevronRight className="size-4" />
                </button>
            </span>
        </div>
    );
}

function DialogFrame({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
    return (
        <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-3"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-2xl">
                <div className="flex items-center">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    <button type="button" onClick={close} className="ml-auto inline-flex size-8 items-center justify-center rounded-full hover:bg-muted">
                        <X className="size-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function EditDialog({ editing, busy, close, save }: { editing: { avatar: VrchatAvatar; mode: EditMode }; busy: boolean; close: () => void; save: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
    const description = editing.mode === "description";
    return (
        <DialogFrame title={description ? "Change avatar description" : "Rename avatar"} close={close}>
            <form onSubmit={(event) => void save(event)}>
                <p className="mt-2 text-xs text-muted-foreground">{editing.avatar.name}</p>
                {description ? (
                    <textarea name="value" defaultValue={editing.avatar.description || ""} maxLength={256} rows={5} className="mt-3 w-full rounded-md border border-input bg-background p-2 text-xs" />
                ) : (
                    <input name="value" defaultValue={editing.avatar.name} maxLength={64} className="mt-3 h-9 w-full rounded-md border border-input bg-background px-2 text-xs" />
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={close} className="h-9 rounded-md bg-secondary px-3 text-xs">
                        Cancel
                    </button>
                    <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                        Save
                    </button>
                </div>
            </form>
        </DialogFrame>
    );
}

function TagsDialog({ avatar, initial, busy, close, save }: { avatar: VrchatAvatar; initial: AvatarTag[]; busy: boolean; close: () => void; save: (tags: AvatarTag[]) => void }) {
    const [entries, setEntries] = useState(initial);
    const [value, setValue] = useState("");
    function add() {
        const tag = value.trim();
        if (!tag || entries.some((entry) => entry.tag.toLocaleLowerCase() === tag.toLocaleLowerCase())) return;
        setEntries((current) => [...current, { tag, color: null }]);
        setValue("");
    }
    return (
        <DialogFrame title="Manage tags" close={close}>
            <p className="mt-1 text-xs text-muted-foreground">{avatar.name}</p>
            <p className="mt-3 text-xs text-muted-foreground">Add tags separated with Enter. Select a color for each local tag.</p>
            <div className="mt-2 flex gap-2">
                <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            add();
                        }
                    }}
                    maxLength={32}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    placeholder="Add tag"
                />
                <button type="button" onClick={add} className="h-9 rounded-md border border-input px-3 text-xs">
                    Add
                </button>
            </div>
            <div className="mt-3 flex max-h-60 flex-col gap-2 overflow-auto">
                {entries.map((entry, index) => (
                    <div key={entry.tag} className="flex items-center gap-2 rounded border border-border p-2">
                        <span className="min-w-0 flex-1 truncate text-xs">{entry.tag}</span>
                        <input
                            type="color"
                            value={entry.color || hashColor(entry.tag)}
                            onChange={(event) => setEntries((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, color: event.target.value } : item)))}
                            className="size-7 rounded border-0 bg-transparent"
                            aria-label={`Color for ${entry.tag}`}
                        />
                        <button type="button" onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="inline-flex size-7 items-center justify-center rounded hover:bg-muted">
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={close} className="h-9 rounded-md bg-secondary px-3 text-xs">
                    Cancel
                </button>
                <button type="button" onClick={() => save(entries)} disabled={busy} className="h-9 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">
                    Save
                </button>
            </div>
        </DialogFrame>
    );
}
