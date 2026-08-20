"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Apple, Clipboard, Ellipsis, ExternalLink, History, ImageIcon, Loader2, Monitor, Pencil, Plus, RefreshCw, Smartphone, Trash2, User, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FavoriteAction } from "@/components/favorite-action";
import { FriendAvatar } from "@/components/friends/friend-avatar";
import { MemoField } from "@/components/memo-field";
import { PreviousInstancesDialog } from "@/components/previous-instances/previous-instances-dialog";
import { VrchatImage } from "@/components/vrchat-image";
import type { VrchatUser, VrchatWorld } from "@/lib/vrchat/types";
import { normalizeYoutubePreview, type WorldTagSettings, worldTagSettingsFromWorld } from "@/lib/vrchat/world-metadata";

type WorldTab = "Info" | "Instances" | "JSON";
type WorldEditField = "capacity" | "description" | "name" | "previewYoutubeId" | "recommendedCapacity";
type WorldManageDialog = "domains" | "tags";
type WorldDomainInput = { id: number; value: string };

export function WorldDialog({ worldId, friends, openUser, onClose }: { worldId: string; friends: VrchatUser[]; openUser: (userId: string) => void; onClose: () => void }) {
    const currentUser = useCurrentUser();
    const [world, setWorld] = useState<VrchatWorld | null>(null);
    const [tab, setTab] = useState<WorldTab>("Info");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");
    const [previousInstancesOpen, setPreviousInstancesOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [editField, setEditField] = useState<WorldEditField | null>(null);
    const [editValue, setEditValue] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [manageDialog, setManageDialog] = useState<WorldManageDialog | null>(null);
    const [tagSettings, setTagSettings] = useState<WorldTagSettings | null>(null);
    const [authorTags, setAuthorTags] = useState("");
    const [domainList, setDomainList] = useState<WorldDomainInput[]>([]);
    const [manageSaving, setManageSaving] = useState(false);
    const [status, setStatus] = useState("");
    const closeButton = useRef<HTMLButtonElement>(null);
    const previousInstancesButton = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const manageButton = useRef<HTMLButtonElement>(null);
    const editorDialog = useRef<HTMLDivElement>(null);
    const editorInput = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const previousEditField = useRef<WorldEditField | null>(null);
    const manageDialogRef = useRef<HTMLDivElement>(null);
    const manageInitialFocus = useRef<HTMLElement>(null);
    const previousManageDialog = useRef<WorldManageDialog | null>(null);
    const nextDomainId = useRef(1);

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
        setPreviousInstancesOpen(false);
        setMenuOpen(false);
        setEditField(null);
        setManageDialog(null);
        setStatus("");
        void load();
        closeButton.current?.focus();
    }, [load]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            if (editField) {
                if (!editSaving) setEditField(null);
                return;
            }
            if (manageDialog) {
                if (!manageSaving) setManageDialog(null);
                return;
            }
            if (menuOpen) {
                setMenuOpen(false);
                return;
            }
            onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [editField, editSaving, manageDialog, manageSaving, menuOpen, onClose]);

    useEffect(() => {
        if (!menuOpen) return;
        function closeOutside(event: PointerEvent) {
            if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
        }
        window.addEventListener("pointerdown", closeOutside);
        return () => window.removeEventListener("pointerdown", closeOutside);
    }, [menuOpen]);

    useEffect(() => {
        if (editField) editorInput.current?.focus();
        else if (previousEditField.current) manageButton.current?.focus();
        previousEditField.current = editField;
    }, [editField]);

    useEffect(() => {
        if (manageDialog) manageInitialFocus.current?.focus();
        else if (previousManageDialog.current) manageButton.current?.focus();
        previousManageDialog.current = manageDialog;
    }, [manageDialog]);

    async function copy(value: string, label: string) {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1_500);
    }

    function requestEdit(field: WorldEditField) {
        if (!world) return;
        const values: Record<WorldEditField, string> = {
            capacity: String(world.capacity ?? ""),
            description: world.description || "",
            name: world.name,
            previewYoutubeId: world.previewYoutubeId || "",
            recommendedCapacity: String(world.recommendedCapacity ?? ""),
        };
        setMenuOpen(false);
        setError("");
        setEditValue(values[field]);
        setEditField(field);
    }

    function requestManageDialog(dialog: WorldManageDialog) {
        if (!world) return;
        setMenuOpen(false);
        setError("");
        if (dialog === "tags") {
            const settings = worldTagSettingsFromWorld(world);
            setTagSettings(settings);
            setAuthorTags(settings.authorTags.join(","));
        } else {
            setDomainList((world.urlList || []).map((value) => ({ id: nextDomainId.current++, value })));
        }
        setManageDialog(dialog);
    }

    function trapEditorFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(editorDialog.current?.querySelectorAll<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])") ?? []);
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    function trapManageFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(manageDialogRef.current?.querySelectorAll<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])") ?? []);
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    async function saveEditor() {
        if (!world || !editField) return;
        const trimmed = editValue.trim();
        let body: Record<string, string | number>;
        if (editField === "capacity" || editField === "recommendedCapacity") {
            const value = Number(trimmed);
            if (!Number.isInteger(value) || value < 0 || value > 80) {
                setError("Enter a whole number from 0 through 80.");
                return;
            }
            body = { [editField]: value };
        } else if (editField === "previewYoutubeId") {
            const previewYoutubeId = normalizeYoutubePreview(trimmed);
            if (previewYoutubeId === null) {
                setError("Valid YouTube video ID or URL is required.");
                return;
            }
            body = { previewYoutubeId };
        } else {
            if (!trimmed) return;
            body = { [editField]: trimmed };
        }
        setEditSaving(true);
        setError("");
        try {
            const response = await fetch(`/api/worlds/${encodeURIComponent(world.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json()) as { world?: VrchatWorld; error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.world) throw new Error(payload.error || "The world could not be updated.");
            setWorld(payload.world);
            setStatus(worldEditStatus(editField));
            setEditField(null);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "The world could not be updated.");
        } finally {
            setEditSaving(false);
        }
    }

    async function saveManageDialog() {
        if (!world || !manageDialog) return;
        let body: { tagSettings: WorldTagSettings } | { urlList: string[] };
        if (manageDialog === "tags") {
            if (!tagSettings) return;
            const parsedAuthorTags = [
                ...new Set(
                    authorTags
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                ),
            ];
            if (parsedAuthorTags.length > 20 || parsedAuthorTags.some((tag) => tag.length > 64)) {
                setError("Enter at most 20 author tags of 64 characters or fewer.");
                return;
            }
            body = { tagSettings: { ...tagSettings, authorTags: parsedAuthorTags } };
        } else {
            const urlList = domainList.map((domain) => domain.value.trim()).filter(Boolean);
            if (urlList.length > 100 || new Set(urlList).size !== urlList.length || urlList.some((domain) => domain.length > 253)) {
                setError("Domains must be unique and 253 characters or fewer.");
                return;
            }
            body = { urlList };
        }
        setManageSaving(true);
        setError("");
        try {
            const response = await fetch(`/api/worlds/${encodeURIComponent(world.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json()) as { world?: VrchatWorld; error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.world) throw new Error(payload.error || "The world could not be updated.");
            setWorld(payload.world);
            setStatus(manageDialog === "tags" ? "World tags changed" : "Allowed video player domains changed");
            setManageDialog(null);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "The world could not be updated.");
        } finally {
            setManageSaving(false);
        }
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
                                <VrchatImage src={world.thumbnailImageUrl || world.imageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" fallback={<ImageIcon className="size-8 text-muted-foreground" />} />
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
                                <FavoriteAction kind="world" objectId={world.id} label={world.name} />
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
                                {world.authorId === currentUser.id ? (
                                    <div ref={menu} className="relative">
                                        <button ref={manageButton} type="button" onClick={() => setMenuOpen((value) => !value)} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted" aria-label="Manage world" aria-haspopup="menu" aria-expanded={menuOpen}>
                                            <Ellipsis className="size-4" />
                                        </button>
                                        {menuOpen ? (
                                            <div role="menu" className="absolute top-11 right-0 z-50 min-w-60 rounded-md border border-border bg-popover p-1 text-xs shadow-xl">
                                                <WorldEditMenuItem label="Rename" action={() => requestEdit("name")} />
                                                <WorldEditMenuItem label="Change Description" action={() => requestEdit("description")} />
                                                <WorldEditMenuItem label="Change Capacity" action={() => requestEdit("capacity")} />
                                                <WorldEditMenuItem label="Change Recommended Capacity" action={() => requestEdit("recommendedCapacity")} />
                                                <WorldEditMenuItem label="Change YouTube Preview" action={() => requestEdit("previewYoutubeId")} />
                                                <WorldEditMenuItem label="Change Content Warnings, Settings and Tags" action={() => requestManageDialog("tags")} />
                                                <WorldEditMenuItem label="Change Allowed Video Player Domains" action={() => requestManageDialog("domains")} />
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </header>
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        {status ? (
                            <p className="sr-only" role="status">
                                {status}
                            </p>
                        ) : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="World details">
                            {(["Info", "Instances", "JSON"] as WorldTab[]).map((item) => (
                                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tab === "Info" ? <WorldInfo world={world} copy={copy} copied={copied} onOpenPreviousInstances={() => setPreviousInstancesOpen(true)} previousInstancesButton={previousInstancesButton} /> : null}
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
                        {editField ? (
                            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
                                <form
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void saveEditor();
                                    }}
                                    className="contents"
                                >
                                    <div ref={editorDialog} role="dialog" aria-modal="true" aria-labelledby="world-editor-title" aria-describedby="world-editor-description" onKeyDown={trapEditorFocus} className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl">
                                        <h3 id="world-editor-title" className="text-sm font-semibold">
                                            {worldEditTitle(editField)}
                                        </h3>
                                        <p id="world-editor-description" className="mt-2 text-xs text-muted-foreground">
                                            {worldEditDescription(editField)}
                                        </p>
                                        {editField === "description" ? (
                                            <textarea
                                                ref={(node) => {
                                                    editorInput.current = node;
                                                }}
                                                value={editValue}
                                                onChange={(event) => setEditValue(event.target.value)}
                                                rows={4}
                                                maxLength={1_024}
                                                className="mt-3 w-full resize-none rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                        ) : (
                                            <input
                                                ref={(node) => {
                                                    editorInput.current = node;
                                                }}
                                                type={editField === "capacity" || editField === "recommendedCapacity" ? "number" : "text"}
                                                min={editField === "capacity" || editField === "recommendedCapacity" ? 0 : undefined}
                                                max={editField === "capacity" || editField === "recommendedCapacity" ? 80 : undefined}
                                                value={editValue}
                                                onChange={(event) => setEditValue(event.target.value)}
                                                maxLength={editField === "name" ? 64 : undefined}
                                                className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                        )}
                                        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                                        <div className="mt-5 flex justify-end gap-2">
                                            <button type="button" onClick={() => setEditField(null)} disabled={editSaving} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                                                Cancel
                                            </button>
                                            <button type="submit" disabled={editSaving || !editValue.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                                                {editSaving ? <Loader2 className="size-4 animate-spin" /> : null} OK
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        ) : null}
                        {manageDialog ? (
                            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-3">
                                <form
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void saveManageDialog();
                                    }}
                                    className="contents"
                                >
                                    <div
                                        ref={manageDialogRef}
                                        role="dialog"
                                        aria-modal="true"
                                        aria-labelledby="world-manage-title"
                                        onKeyDown={trapManageFocus}
                                        className={`flex max-h-[calc(100dvh-24px)] w-full flex-col rounded-xl border border-border bg-popover p-4 shadow-2xl ${manageDialog === "domains" ? "max-w-[600px]" : "max-w-[400px]"}`}
                                    >
                                        <h3 id="world-manage-title" className="shrink-0 text-sm font-semibold">
                                            {manageDialog === "tags" ? "Set World Tags" : "Allowed Video Player Domains"}
                                        </h3>
                                        {manageDialog === "tags" && tagSettings ? (
                                            <WorldTagsEditor settings={tagSettings} authorTags={authorTags} initialFocus={manageInitialFocus} setAuthorTags={setAuthorTags} setSettings={setTagSettings} />
                                        ) : (
                                            <WorldDomainsEditor domains={domainList} initialFocus={manageInitialFocus} setDomains={setDomainList} />
                                        )}
                                        {error ? <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p> : null}
                                        <div className="mt-4 flex shrink-0 justify-end gap-2">
                                            {manageDialog === "tags" ? (
                                                <button type="button" onClick={() => setManageDialog(null)} disabled={manageSaving} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                                                    Cancel
                                                </button>
                                            ) : null}
                                            <button type="submit" disabled={manageSaving} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                                                {manageSaving ? <Loader2 className="size-4 animate-spin" /> : null} Save
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        ) : null}
                    </>
                ) : null}
            </section>
            {previousInstancesOpen && world ? <PreviousInstancesDialog variant="world" entityId={world.id} label={world.name} onClose={() => setPreviousInstancesOpen(false)} returnFocusRef={previousInstancesButton} /> : null}
        </div>
    );
}

type BooleanWorldTagKey = Exclude<keyof WorldTagSettings, "authorTags">;

const WORLD_TAG_SECTIONS: Array<{ title?: string; options: Array<[BooleanWorldTagKey, string]> }> = [
    {
        options: [
            ["avatarScalingDisabled", "Disable avatar scaling"],
            ["focusViewDisabled", "Disable focus view"],
            ["debugAllowed", "Enable world debugging for others"],
        ],
    },
    {
        title: "Content Warning Tags",
        options: [
            ["contentHorror", "Horror"],
            ["contentGore", "Gore"],
            ["contentViolence", "Violence"],
            ["contentAdult", "Adult"],
            ["contentSex", "Sexual"],
        ],
    },
    {
        title: "Default Content Settings",
        options: [
            ["emoji", "Emoji"],
            ["stickers", "Stickers"],
            ["pedestals", "Sharing Pedestals"],
            ["prints", "Prints"],
            ["drones", "Drones"],
            ["props", "Items"],
            ["thirdPerson", "Third Person"],
            ["propMovement", "Props that Modify Player Movement"],
        ],
    },
];

function WorldTagsEditor({ settings, authorTags, initialFocus, setAuthorTags, setSettings }: { settings: WorldTagSettings; authorTags: string; initialFocus: React.RefObject<HTMLElement | null>; setAuthorTags: (value: string) => void; setSettings: React.Dispatch<React.SetStateAction<WorldTagSettings | null>> }) {
    function update(field: BooleanWorldTagKey, checked: boolean) {
        setSettings((current) => (current ? { ...current, [field]: checked } : current));
    }
    let optionIndex = 0;
    return (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-xs">
            {WORLD_TAG_SECTIONS.map((section, sectionIndex) => (
                <div key={section.title || "settings"} className={sectionIndex ? "mt-3" : "mt-2"}>
                    {section.title ? <p className="mb-1.5 font-medium">{section.title}</p> : null}
                    <div className="grid gap-2">
                        {section.options.map(([field, label]) => {
                            const isFirst = optionIndex++ === 0;
                            return (
                                <label key={field} className="inline-flex items-center gap-2">
                                    <input
                                        ref={
                                            isFirst
                                                ? (node) => {
                                                      initialFocus.current = node;
                                                  }
                                                : undefined
                                        }
                                        type="checkbox"
                                        checked={settings[field]}
                                        onChange={(event) => update(field, event.target.checked)}
                                        className="size-4 accent-primary"
                                    />
                                    {label}
                                </label>
                            );
                        })}
                    </div>
                    {sectionIndex === 0 ? (
                        <label className="mt-3 block">
                            <span>Author Tags (comma separated)</span>
                            <textarea value={authorTags} onChange={(event) => setAuthorTags(event.target.value)} rows={2} maxLength={1_299} className="mt-1.5 w-full resize-none rounded-md border border-input bg-background p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </label>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

function WorldDomainsEditor({ domains, initialFocus, setDomains }: { domains: WorldDomainInput[]; initialFocus: React.RefObject<HTMLElement | null>; setDomains: React.Dispatch<React.SetStateAction<WorldDomainInput[]>> }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto pt-2">
            <div className="grid gap-1.5">
                {domains.map((domain, index) => (
                    <div key={domain.id} className="flex items-center gap-1.5">
                        <input
                            ref={
                                index === 0
                                    ? (node) => {
                                          initialFocus.current = node;
                                      }
                                    : undefined
                            }
                            value={domain.value}
                            onChange={(event) => setDomains((current) => current.map((item) => (item.id === domain.id ? { ...item, value: event.target.value } : item)))}
                            maxLength={253}
                            aria-label={`Allowed domain ${index + 1}`}
                            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <button type="button" onClick={() => setDomains((current) => current.filter((item) => item.id !== domain.id))} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted" aria-label={`Remove domain ${index + 1}`}>
                            <Trash2 className="size-4" />
                        </button>
                    </div>
                ))}
            </div>
            <button
                ref={
                    domains.length === 0
                        ? (node) => {
                              initialFocus.current = node;
                          }
                        : undefined
                }
                type="button"
                onClick={() => setDomains((current) => [...current, { id: Math.max(0, ...current.map((domain) => domain.id)) + 1, value: "" }])}
                className="mt-1.5 inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 text-xs hover:bg-muted"
            >
                <Plus className="size-4" /> Add Domain
            </button>
        </div>
    );
}

function WorldEditMenuItem({ label, action }: { label: string; action: () => void }) {
    return (
        <button type="button" role="menuitem" onClick={action} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
            <Pencil className="size-4" /> {label}
        </button>
    );
}

function worldEditTitle(field: WorldEditField) {
    const titles: Record<WorldEditField, string> = { capacity: "Change Capacity", description: "Change Description", name: "Rename World", previewYoutubeId: "Change YouTube Preview", recommendedCapacity: "Change Recommended Capacity" };
    return titles[field];
}

function worldEditDescription(field: WorldEditField) {
    const descriptions: Record<WorldEditField, string> = {
        capacity: "Enter world maximum capacity (hard cap), Max: 80",
        description: "Enter world description",
        name: "Enter world name",
        previewYoutubeId: "Enter world YouTube preview",
        recommendedCapacity: "Enter world recommended capacity (soft cap)",
    };
    return descriptions[field];
}

function worldEditStatus(field: WorldEditField) {
    const statuses: Record<WorldEditField, string> = { capacity: "World capacity changed", description: "World description changed", name: "World renamed", previewYoutubeId: "World YouTube preview changed", recommendedCapacity: "World recommended capacity changed" };
    return statuses[field];
}

function WorldInfo({ world, copy, copied, onOpenPreviousInstances, previousInstancesButton }: { world: VrchatWorld; copy: (value: string, label: string) => Promise<void>; copied: string; onOpenPreviousInstances: () => void; previousInstancesButton: React.RefObject<HTMLButtonElement | null> }) {
    const favoriteRate = world.visits ? `${Math.round(((world.favorites || 0) / world.visits) * 10_000) / 100}%` : "—";
    const platforms = worldPlatforms(world).map(platformLabel).join(", ") || "Unknown";
    const occupants = world.occupants ?? (world.publicOccupants !== undefined || world.privateOccupants !== undefined ? (world.publicOccupants || 0) + (world.privateOccupants || 0) : undefined);
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1">
            <div className="col-span-full">
                <MemoField entityType="world" entityId={world.id} />
            </div>
            <Info label="World ID" value={copied === "ID" ? "Copied" : world.id} action={() => void copy(world.id, "ID")} />
            <Info label="Occupants" value={number(occupants)} />
            <Info label="Capacity" value={`${world.recommendedCapacity ?? world.capacity ?? "—"} / ${world.capacity ?? "—"}`} />
            <Info label="Favorites" value={number(world.favorites)} />
            <Info label="Visits" value={number(world.visits)} />
            <button ref={previousInstancesButton} type="button" onClick={onOpenPreviousInstances} aria-label="Previous Instances" className="box-border min-w-0 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                <span className="flex items-center gap-1 font-medium leading-[18px]">
                    <History className="size-3.5" /> Previous Instances
                </span>
                <span className="block truncate text-xs text-muted-foreground">Remote visit history</span>
            </button>
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
