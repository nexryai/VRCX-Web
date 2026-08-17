"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Apple, Check, CheckCircle, ChevronLeft, ChevronRight, Ellipsis, ImageIcon, Loader2, Monitor, Pencil, RefreshCw, Share2, Smartphone, Trash2, Upload, User, X, XCircle } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FavoriteAction } from "@/components/favorite-action";
import { MemoField } from "@/components/memo-field";
import { VrchatImage } from "@/components/vrchat-image";
import { latestAvatarGalleryImageUrl } from "@/lib/vrchat/avatar-gallery";
import type { VrchatAvatar, VrchatAvatarStyle, VrchatFile } from "@/lib/vrchat/types";

type AvatarTab = "Info" | "JSON";
type AvatarConfirmAction = "block" | "delete-avatar" | "delete-impostor" | "enqueue-impostor" | "make-private" | "make-public" | "regenerate-impostor" | "select-fallback" | "unblock";
type AvatarEditField = "description" | "name";
type AvatarMetadataDialog = "content" | "styles";

export function AvatarDialog({ avatarId, initialMetadata, openUser, onClose }: { avatarId: string; initialMetadata?: AvatarMetadataDialog; openUser: (userId: string) => void; onClose: () => void }) {
    const currentUser = useCurrentUser();
    const [avatar, setAvatar] = useState<VrchatAvatar | null>(null);
    const [tab, setTab] = useState<AvatarTab>("Info");
    const [loading, setLoading] = useState(true);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState(currentUser.currentAvatar === avatarId);
    const [isBlocked, setIsBlocked] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<AvatarConfirmAction | null>(null);
    const [moderating, setModerating] = useState(false);
    const [galleryFiles, setGalleryFiles] = useState<VrchatFile[]>([]);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [galleryUploading, setGalleryUploading] = useState(false);
    const [galleryError, setGalleryError] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [editField, setEditField] = useState<AvatarEditField | null>(null);
    const [editValue, setEditValue] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [metadataDialog, setMetadataDialog] = useState<AvatarMetadataDialog | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataSaving, setMetadataSaving] = useState(false);
    const [contentTagsCsv, setContentTagsCsv] = useState("");
    const [ownedAvatars, setOwnedAvatars] = useState<VrchatAvatar[]>([]);
    const [selectedAvatarIds, setSelectedAvatarIds] = useState<string[]>([]);
    const [styleOptions, setStyleOptions] = useState<VrchatAvatarStyle[]>([]);
    const [primaryStyle, setPrimaryStyle] = useState("");
    const [secondaryStyle, setSecondaryStyle] = useState("");
    const [authorTagsCsv, setAuthorTagsCsv] = useState("");
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [copied, setCopied] = useState("");
    const closeButton = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const manageButton = useRef<HTMLButtonElement>(null);
    const confirmationDialog = useRef<HTMLDivElement>(null);
    const confirmationCancel = useRef<HTMLButtonElement>(null);
    const previousConfirmAction = useRef<AvatarConfirmAction | null>(null);
    const galleryInput = useRef<HTMLInputElement>(null);
    const previewClose = useRef<HTMLButtonElement>(null);
    const previewTrigger = useRef<HTMLButtonElement | null>(null);
    const editorDialog = useRef<HTMLDivElement>(null);
    const editorInput = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const previousEditField = useRef<AvatarEditField | null>(null);
    const metadataDialogRef = useRef<HTMLDivElement>(null);
    const metadataInitialFocus = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);
    const previousMetadataDialog = useRef<AvatarMetadataDialog | null>(null);
    const initialMetadataOpened = useRef(false);

    const loadGallery = useCallback(
        async (refresh = false) => {
            setGalleryLoading(true);
            setGalleryError("");
            try {
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}/gallery${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; files?: VrchatFile[] };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.files) throw new Error(payload.error || "The avatar gallery could not be loaded.");
                setGalleryFiles(payload.files);
                setGalleryIndex(0);
            } catch (loadError) {
                setGalleryError(loadError instanceof Error ? loadError.message : "The avatar gallery could not be loaded.");
            } finally {
                setGalleryLoading(false);
            }
        },
        [avatarId],
    );

    const load = useCallback(
        async (refresh = false) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; avatar?: VrchatAvatar; isBlocked?: boolean };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be loaded.");
                setAvatar(payload.avatar);
                setIsBlocked(payload.isBlocked === true);
                void loadGallery(refresh);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "The avatar could not be loaded.");
            } finally {
                setLoading(false);
            }
        },
        [avatarId, loadGallery],
    );

    useEffect(() => {
        setAvatar(null);
        setTab("Info");
        setSelected(currentUser.currentAvatar === avatarId);
        setIsBlocked(false);
        setMenuOpen(false);
        setConfirmAction(null);
        setStatus("");
        setGalleryFiles([]);
        setGalleryIndex(0);
        setGalleryError("");
        setPreviewUrl("");
        setEditField(null);
        setEditValue("");
        setMetadataDialog(null);
        initialMetadataOpened.current = false;
        void load();
        closeButton.current?.focus();
    }, [avatarId, currentUser.currentAvatar, load]);

    // The command is intentionally consumed once per avatar load; depending on
    // the render-local dispatcher would reopen it on every render.
    // biome-ignore lint/correctness/useExhaustiveDependencies: guarded one-shot dialog command
    useEffect(() => {
        if (!avatar || avatar.authorId !== currentUser.id || !initialMetadata || initialMetadataOpened.current) return;
        initialMetadataOpened.current = true;
        void requestMetadataDialog(initialMetadata);
    }, [avatar, currentUser.id, initialMetadata]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            if (previewUrl) {
                setPreviewUrl("");
                window.requestAnimationFrame(() => previewTrigger.current?.focus());
                return;
            }
            if (editField) {
                setEditField(null);
                return;
            }
            if (metadataDialog) {
                if (!metadataSaving) setMetadataDialog(null);
                return;
            }
            if (confirmAction) {
                setConfirmAction(null);
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
    }, [confirmAction, editField, menuOpen, metadataDialog, metadataSaving, onClose, previewUrl]);

    useEffect(() => {
        if (confirmAction) confirmationCancel.current?.focus();
        else if (previousConfirmAction.current) manageButton.current?.focus();
        previousConfirmAction.current = confirmAction;
    }, [confirmAction]);

    useEffect(() => {
        if (!menuOpen) return;
        function closeOutside(event: PointerEvent) {
            if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
        }
        window.addEventListener("pointerdown", closeOutside);
        return () => window.removeEventListener("pointerdown", closeOutside);
    }, [menuOpen]);

    useEffect(() => {
        if (previewUrl) previewClose.current?.focus();
    }, [previewUrl]);

    useEffect(() => {
        if (editField) editorInput.current?.focus();
        else if (previousEditField.current) manageButton.current?.focus();
        previousEditField.current = editField;
    }, [editField]);

    useEffect(() => {
        if (metadataDialog && !metadataLoading) metadataInitialFocus.current?.focus();
        else if (previousMetadataDialog.current) manageButton.current?.focus();
        previousMetadataDialog.current = metadataDialog;
    }, [metadataDialog, metadataLoading]);

    async function copy(value: string, label: string) {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1_500);
    }

    async function selectAvatar() {
        if (selected) return;
        setSelecting(true);
        setError("");
        try {
            const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select" }) });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The avatar could not be selected.");
            setSelected(true);
        } catch (selectError) {
            setError(selectError instanceof Error ? selectError.message : "The avatar could not be selected.");
        } finally {
            setSelecting(false);
        }
    }

    function requestConfirmation(action: AvatarConfirmAction) {
        setMenuOpen(false);
        setError("");
        setConfirmAction(action);
    }

    function trapConfirmationFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(confirmationDialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    async function runConfirmedAction() {
        if (!confirmAction) return;
        setModerating(true);
        setError("");
        setStatus("");
        try {
            if (confirmAction === "make-private" || confirmAction === "make-public") {
                const releaseStatus = confirmAction === "make-public" ? "public" : "private";
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseStatus }) });
                const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be updated.");
                setAvatar(payload.avatar);
                setStatus(releaseStatus === "public" ? "Avatar updated to public" : "Avatar updated to private");
                setConfirmAction(null);
                return;
            }
            if (confirmAction === "delete-avatar") {
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}`, { method: "DELETE" });
                const payload = (await response.json()) as { error?: string };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok) throw new Error(payload.error || "The avatar could not be deleted.");
                setConfirmAction(null);
                onClose();
                return;
            }
            const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}/actions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: confirmAction }),
            });
            const payload = (await response.json()) as { error?: string; hasImpostor?: boolean; isBlocked?: boolean };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok) throw new Error(payload.error || "The avatar moderation could not be changed.");
            if (confirmAction === "block" || confirmAction === "unblock") setIsBlocked(payload.isBlocked === true);
            if (payload.hasImpostor === false) setAvatar((current) => (current ? { ...current, unityPackages: current.unityPackages?.filter((item) => item.variant !== "impostor") } : current));
            setStatus(avatarActionStatus(confirmAction));
            setConfirmAction(null);
        } catch (moderationError) {
            setError(moderationError instanceof Error ? moderationError.message : "The avatar moderation could not be changed.");
        } finally {
            setModerating(false);
        }
    }

    function requestEdit(field: AvatarEditField) {
        if (!avatar) return;
        setMenuOpen(false);
        setError("");
        setEditField(field);
        setEditValue(field === "name" ? avatar.name : avatar.description || "");
    }

    function closeEditor() {
        setEditField(null);
    }

    function trapEditorFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(editorDialog.current?.querySelectorAll<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])") ?? []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    async function saveEditor() {
        if (!editField || !editValue.trim()) return;
        setEditSaving(true);
        setError("");
        try {
            const body = editField === "name" ? { name: editValue.trim() } : { description: editValue.trim() };
            const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be updated.");
            setAvatar(payload.avatar);
            setStatus(editField === "name" ? "Avatar renamed" : "Avatar description changed");
            closeEditor();
        } catch (editError) {
            setError(editError instanceof Error ? editError.message : "The avatar could not be updated.");
        } finally {
            setEditSaving(false);
        }
    }

    async function requestMetadataDialog(mode: AvatarMetadataDialog) {
        if (!avatar) return;
        setMenuOpen(false);
        setError("");
        setMetadataDialog(mode);
        setMetadataLoading(true);
        if (mode === "content") {
            setContentTagsCsv(
                (avatar.tags || [])
                    .filter((tag) => tag.startsWith("content_"))
                    .map((tag) => tag.slice(8))
                    .join(","),
            );
            setOwnedAvatars([avatar]);
            setSelectedAvatarIds([avatar.id]);
            try {
                const all = new Map<string, VrchatAvatar>([[avatar.id, avatar]]);
                for (let offset = 0; offset <= 5_000; offset += 50) {
                    const response = await fetch(`/api/avatars?offset=${offset}`, { cache: "no-store" });
                    const payload = (await response.json()) as { avatars?: VrchatAvatar[]; error?: string };
                    if (response.status === 401) window.location.assign("/login");
                    if (!response.ok || !payload.avatars) throw new Error(payload.error || "Owned avatars could not be loaded.");
                    for (const item of payload.avatars) all.set(item.id, item);
                    if (payload.avatars.length < 50) break;
                }
                setOwnedAvatars([...all.values()]);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Owned avatars could not be loaded.");
            } finally {
                setMetadataLoading(false);
            }
            return;
        }

        setPrimaryStyle(avatar.styles?.primary || "");
        setSecondaryStyle(avatar.styles?.secondary || "");
        setAuthorTagsCsv(
            (avatar.tags || [])
                .filter((tag) => tag.startsWith("author_tag_"))
                .map((tag) => tag.slice(11))
                .join(","),
        );
        try {
            const response = await fetch("/api/avatars/styles", { cache: "no-store" });
            const payload = (await response.json()) as { styles?: VrchatAvatarStyle[]; error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.styles) throw new Error(payload.error || "Avatar styles could not be loaded.");
            setStyleOptions(payload.styles);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Avatar styles could not be loaded.");
        } finally {
            setMetadataLoading(false);
        }
    }

    function closeMetadataDialog() {
        if (metadataSaving) return;
        setMetadataDialog(null);
        setError("");
    }

    function trapMetadataFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(metadataDialogRef.current?.querySelectorAll<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])") ?? []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    async function saveMetadataDialog() {
        if (!metadataDialog || !avatar) return;
        setMetadataSaving(true);
        setError("");
        try {
            if (metadataDialog === "content") {
                const contentTags = splitEditableTags(contentTagsCsv);
                for (const id of selectedAvatarIds) {
                    const response = await fetch(`/api/avatars/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentTags }) });
                    const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
                    if (response.status === 401) window.location.assign("/login");
                    if (!response.ok || !payload.avatar) throw new Error(payload.error || "Avatar content tags could not be updated.");
                    if (id === avatar.id) setAvatar(payload.avatar);
                }
                setStatus("Avatar content tags changed");
            } else {
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatar.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ styles: { primary: primaryStyle, secondary: secondaryStyle }, authorTags: splitEditableTags(authorTagsCsv) }),
                });
                const payload = (await response.json()) as { avatar?: VrchatAvatar; error?: string };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.avatar) throw new Error(payload.error || "Avatar styles and author tags could not be updated.");
                setAvatar(payload.avatar);
                setStatus("Avatar styles and author tags changed");
            }
            setMetadataDialog(null);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Avatar metadata could not be updated.");
        } finally {
            setMetadataSaving(false);
        }
    }

    async function uploadGalleryImage(file: File) {
        setGalleryUploading(true);
        setGalleryError("");
        setStatus("");
        try {
            const body = new FormData();
            body.set("file", file);
            const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}/gallery`, { method: "POST", body });
            const payload = (await response.json()) as { error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok) throw new Error(payload.error || "The avatar gallery image could not be uploaded.");
            setStatus("Avatar gallery image uploaded");
            await loadGallery(true);
        } catch (uploadError) {
            setGalleryError(uploadError instanceof Error ? uploadError.message : "The avatar gallery image could not be uploaded.");
        } finally {
            setGalleryUploading(false);
            if (galleryInput.current) galleryInput.current.value = "";
        }
    }

    function openPreview(url: string, trigger: HTMLButtonElement) {
        previewTrigger.current = trigger;
        setPreviewUrl(url);
    }

    function closePreview() {
        setPreviewUrl("");
        window.requestAnimationFrame(() => previewTrigger.current?.focus());
    }

    const platforms = useMemo(() => avatarPlatforms(avatar), [avatar]);
    const hasImpostor = avatar?.unityPackages?.some((item) => item.variant === "impostor") === true;
    return (
        <div className="fixed inset-0 z-[84] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close avatar details" />
            <section role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background p-3 shadow-2xl sm:h-[min(86dvh,740px)] sm:max-w-[892px] sm:rounded-xl sm:border sm:p-4">
                <button ref={closeButton} type="button" onClick={onClose} className="absolute top-2 right-2 z-40 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow hover:text-foreground" aria-label="Close">
                    <X className="size-4" />
                </button>
                {loading && !avatar ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Loading avatar…
                    </div>
                ) : null}
                {!loading && !avatar ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div> : null}
                {avatar ? (
                    <>
                        <header className="flex shrink-0 flex-col gap-3 pr-8 sm:flex-row sm:pr-10">
                            <div className="flex h-[120px] w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                <VrchatImage src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" fallback={<ImageIcon className="size-8 text-muted-foreground" />} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="avatar-dialog-title" className="break-words font-bold">
                                    {avatar.name}
                                </h2>
                                {avatar.authorName ? (
                                    <button type="button" onClick={() => avatar.authorId && openUser(avatar.authorId)} disabled={!avatar.authorId} className="mt-1 break-all font-mono text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none">
                                        {avatar.authorName}
                                    </button>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                    <Badge>{avatar.releaseStatus || "private"}</Badge>
                                    {platforms.map((platform) => (
                                        <PlatformBadge key={platform.platform} platform={platform.platform} rating={platform.performanceRating} />
                                    ))}
                                    {avatar.styles?.primary ? <Badge>Style {avatar.styles.primary}</Badge> : null}
                                    {avatar.styles?.secondary ? <Badge>{avatar.styles.secondary}</Badge> : null}
                                    {avatar.unityPackages?.some((item) => item.variant === "impostor") ? <Badge>Impostor</Badge> : null}
                                    {(avatar.tags || [])
                                        .filter((tag) => tag.startsWith("content_") || tag.startsWith("author_tag_"))
                                        .map((tag) => (
                                            <Badge key={tag}>{tag.replace(/^content_|^author_tag_/, "").replaceAll("_", " ")}</Badge>
                                        ))}
                                </div>
                                {avatar.description && avatar.description !== avatar.name ? <p className="mt-2 line-clamp-4 break-words text-xs">{avatar.description}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-end gap-2 sm:mt-12 sm:items-start">
                                <FavoriteAction kind="avatar" objectId={avatar.id} label={avatar.name} />
                                <button
                                    type="button"
                                    onClick={() => void selectAvatar()}
                                    disabled={selected || selecting}
                                    className={`inline-flex size-9 items-center justify-center rounded-full border disabled:opacity-70 ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted"}`}
                                    aria-label={selected ? "Current avatar" : "Select avatar"}
                                >
                                    {selecting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                                </button>
                                <div ref={menu} className="relative">
                                    <button
                                        ref={manageButton}
                                        type="button"
                                        onClick={() => setMenuOpen((value) => !value)}
                                        className={`inline-flex size-9 items-center justify-center rounded-full border ${isBlocked ? "border-destructive bg-destructive text-white" : "border-input hover:bg-muted"}`}
                                        aria-label="Manage avatar"
                                        aria-haspopup="menu"
                                        aria-expanded={menuOpen}
                                    >
                                        <Ellipsis className="size-4" />
                                    </button>
                                    {menuOpen ? (
                                        <div role="menu" className="absolute top-11 left-0 z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-xs shadow-xl sm:right-0 sm:left-auto">
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    void load(true);
                                                }}
                                                disabled={loading}
                                                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted disabled:opacity-40"
                                            >
                                                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    void copy(`https://vrchat.com/home/avatar/${avatar.id}`, "URL");
                                                }}
                                                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted"
                                            >
                                                <Share2 className="size-4" /> {copied === "URL" ? "Copied" : "Share"}
                                            </button>
                                            <div className="my-1 border-t border-border" />
                                            {isBlocked ? (
                                                <button type="button" role="menuitem" onClick={() => requestConfirmation("unblock")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-destructive hover:bg-destructive/10">
                                                    <CheckCircle className="size-4" /> Unblock Avatar
                                                </button>
                                            ) : (
                                                <button type="button" role="menuitem" onClick={() => requestConfirmation("block")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                    <XCircle className="size-4" /> Block Avatar
                                                </button>
                                            )}
                                            {avatar.tags?.some((tag) => tag.includes("quest")) ? (
                                                <button type="button" role="menuitem" onClick={() => requestConfirmation("select-fallback")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                    <Check className="size-4" /> Select Fallback Avatar
                                                </button>
                                            ) : null}
                                            {avatar.authorId === currentUser.id ? (
                                                <>
                                                    <div className="my-1 border-t border-border" />
                                                    <button type="button" role="menuitem" onClick={() => requestConfirmation(avatar.releaseStatus === "public" ? "make-private" : "make-public")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                        <User className="size-4" /> {avatar.releaseStatus === "public" ? "Make Private" : "Make Public"}
                                                    </button>
                                                    <button type="button" role="menuitem" onClick={() => requestEdit("name")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                        <Pencil className="size-4" /> Rename
                                                    </button>
                                                    <button type="button" role="menuitem" onClick={() => requestEdit("description")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                        <Pencil className="size-4" /> Change Description
                                                    </button>
                                                    <button type="button" role="menuitem" onClick={() => void requestMetadataDialog("content")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                        <Pencil className="size-4" /> Change Content Tags
                                                    </button>
                                                    <button type="button" role="menuitem" onClick={() => void requestMetadataDialog("styles")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                        <Pencil className="size-4" /> Change Styles and Author Tags
                                                    </button>
                                                    <div className="my-1 border-t border-border" />
                                                    {hasImpostor ? (
                                                        <>
                                                            <button type="button" role="menuitem" onClick={() => requestConfirmation("regenerate-impostor")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-destructive hover:bg-destructive/10">
                                                                <RefreshCw className="size-4" /> Regenerate Impostor
                                                            </button>
                                                            <button type="button" role="menuitem" onClick={() => requestConfirmation("delete-impostor")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-destructive hover:bg-destructive/10">
                                                                <Trash2 className="size-4" /> Delete Impostor
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button type="button" role="menuitem" onClick={() => requestConfirmation("enqueue-impostor")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted">
                                                            <User className="size-4" /> Create Impostor
                                                        </button>
                                                    )}
                                                    <button type="button" role="menuitem" onClick={() => requestConfirmation("delete-avatar")} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-destructive hover:bg-destructive/10">
                                                        <Trash2 className="size-4" /> Delete
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </header>
                        {error && !confirmAction && !editField && !metadataDialog ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        {status ? (
                            <p className="sr-only" role="status">
                                {status}
                            </p>
                        ) : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Avatar details">
                            {(["Info", "JSON"] as AvatarTab[]).map((item) => (
                                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 flex-1 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tab === "Info" ? (
                                <>
                                    <AvatarGallery
                                        files={galleryFiles}
                                        index={galleryIndex}
                                        loading={galleryLoading}
                                        uploading={galleryUploading}
                                        error={galleryError}
                                        inputRef={galleryInput}
                                        setIndex={setGalleryIndex}
                                        refresh={() => void loadGallery(true)}
                                        upload={(file) => void uploadGalleryImage(file)}
                                        preview={openPreview}
                                        isOwner={avatar.authorId === currentUser.id}
                                    />
                                    <AvatarListings avatar={avatar} preview={openPreview} />
                                    <AvatarInfo avatar={avatar} copied={copied} copy={copy} />
                                </>
                            ) : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(avatar, null, 2)}</pre> : null}
                        </div>
                        {metadataDialog ? (
                            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-3">
                                <div
                                    ref={metadataDialogRef}
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="avatar-metadata-title"
                                    onKeyDown={trapMetadataFocus}
                                    className={`flex max-h-[calc(100dvh-24px)] w-full flex-col rounded-xl border border-border bg-popover p-4 shadow-2xl ${metadataDialog === "content" ? "max-w-[780px]" : "max-w-[400px]"}`}
                                >
                                    <h3 id="avatar-metadata-title" className="shrink-0 text-sm font-semibold">
                                        {metadataDialog === "content" ? "Set Avatar Tags" : "Set Avatar Styles"}
                                    </h3>
                                    {metadataDialog === "content" ? (
                                        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-xs">
                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                {CONTENT_TAGS.map((tag) => (
                                                    <label key={tag} className="inline-flex items-center gap-2">
                                                        <input
                                                            ref={
                                                                tag === CONTENT_TAGS[0]
                                                                    ? (node) => {
                                                                          metadataInitialFocus.current = node;
                                                                      }
                                                                    : undefined
                                                            }
                                                            type="checkbox"
                                                            checked={splitEditableTags(contentTagsCsv).includes(tag)}
                                                            onChange={(event) => setContentTagsCsv(toggleEditableTag(contentTagsCsv, tag, event.target.checked))}
                                                            className="size-4 accent-primary"
                                                        />
                                                        {CONTENT_TAG_LABELS[tag]}
                                                    </label>
                                                ))}
                                            </div>
                                            <textarea
                                                value={contentTagsCsv}
                                                onChange={(event) => setContentTagsCsv(event.target.value)}
                                                rows={2}
                                                maxLength={2_079}
                                                placeholder="Custom tags"
                                                className="mt-3 w-full resize-none rounded-md border border-input bg-background p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <button type="button" onClick={() => setSelectedAvatarIds(selectedAvatarIds.length === ownedAvatars.length ? [] : ownedAvatars.map((item) => item.id))} className="h-8 rounded-md border border-input px-3 hover:bg-muted">
                                                    {selectedAvatarIds.length === ownedAvatars.length ? "Select None" : "Select All"}
                                                </button>
                                                <span>
                                                    {selectedAvatarIds.length} / {ownedAvatars.length}
                                                </span>
                                                {metadataLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                                            </div>
                                            <div className="mt-2 grid max-h-[300px] min-h-15 grid-cols-1 content-start gap-1 overflow-y-auto sm:grid-cols-2">
                                                {ownedAvatars.map((item) => (
                                                    <label key={item.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted">
                                                        <VrchatImage src={item.thumbnailImageUrl || item.imageUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" loading="lazy" fallback={<span className="size-9 rounded-full bg-muted" />} />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate font-medium">{item.name}</span>
                                                            <span className="block truncate text-muted-foreground">{item.releaseStatus || "private"}</span>
                                                            <span className="block truncate text-muted-foreground">
                                                                {(item.tags || [])
                                                                    .filter((tag) => tag.startsWith("content_"))
                                                                    .map((tag) => tag.slice(8))
                                                                    .join(", ")}
                                                            </span>
                                                        </span>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedAvatarIds.includes(item.id)}
                                                            onChange={(event) => setSelectedAvatarIds((current) => (event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)))}
                                                            className="size-4 shrink-0 accent-primary"
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 space-y-3 text-xs">
                                            <label className="block">
                                                <span>Primary Style</span>
                                                <select
                                                    ref={(node) => {
                                                        metadataInitialFocus.current = node;
                                                    }}
                                                    value={primaryStyle}
                                                    onChange={(event) => setPrimaryStyle(event.target.value)}
                                                    disabled={metadataLoading}
                                                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2"
                                                >
                                                    <option value="">None</option>
                                                    {styleOptions.map((style) => (
                                                        <option key={style.id} value={style.styleName}>
                                                            {style.styleName}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span>Secondary Style</span>
                                                <select value={secondaryStyle} onChange={(event) => setSecondaryStyle(event.target.value)} disabled={metadataLoading} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2">
                                                    <option value="">None</option>
                                                    {styleOptions.map((style) => (
                                                        <option key={style.id} value={style.styleName}>
                                                            {style.styleName}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span>Author Tags</span>
                                                <textarea value={authorTagsCsv} onChange={(event) => setAuthorTagsCsv(event.target.value)} rows={3} maxLength={2_079} className="mt-1 w-full resize-none rounded-md border border-input bg-background p-2" />
                                            </label>
                                            {metadataLoading ? (
                                                <p className="inline-flex items-center gap-2 text-muted-foreground">
                                                    <Loader2 className="size-4 animate-spin" /> Loading styles…
                                                </p>
                                            ) : null}
                                        </div>
                                    )}
                                    {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                                    <div className="mt-4 flex shrink-0 justify-end gap-2">
                                        <button type="button" onClick={closeMetadataDialog} disabled={metadataSaving} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void saveMetadataDialog()}
                                            disabled={metadataLoading || metadataSaving || (metadataDialog === "content" && !selectedAvatarIds.length)}
                                            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40"
                                        >
                                            {metadataSaving ? <Loader2 className="size-4 animate-spin" /> : null} Save
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {editField ? (
                            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
                                <form
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void saveEditor();
                                    }}
                                    className="contents"
                                >
                                    <div ref={editorDialog} role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title" aria-describedby="avatar-editor-description" onKeyDown={trapEditorFocus} className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl">
                                        <h3 id="avatar-editor-title" className="text-sm font-semibold">
                                            {editField === "name" ? "Rename Avatar" : "Change Description"}
                                        </h3>
                                        <p id="avatar-editor-description" className="mt-2 text-xs text-muted-foreground">
                                            {editField === "name" ? "Enter avatar name" : "Enter avatar description"}
                                        </p>
                                        {editField === "name" ? (
                                            <input
                                                ref={(node) => {
                                                    editorInput.current = node;
                                                }}
                                                value={editValue}
                                                onChange={(event) => setEditValue(event.target.value)}
                                                maxLength={64}
                                                className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                        ) : (
                                            <textarea
                                                ref={(node) => {
                                                    editorInput.current = node;
                                                }}
                                                value={editValue}
                                                onChange={(event) => setEditValue(event.target.value)}
                                                maxLength={256}
                                                rows={4}
                                                className="mt-3 w-full resize-none rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            />
                                        )}
                                        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                                        <div className="mt-5 flex justify-end gap-2">
                                            <button type="button" onClick={closeEditor} disabled={editSaving} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
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
                        {confirmAction ? (
                            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
                                <div ref={confirmationDialog} role="alertdialog" aria-modal="true" aria-labelledby="avatar-action-title" aria-describedby="avatar-action-description" onKeyDown={trapConfirmationFocus} className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl">
                                    <h3 id="avatar-action-title" className="text-sm font-semibold">
                                        Confirm
                                    </h3>
                                    <p id="avatar-action-description" className="mt-2 text-xs text-muted-foreground">
                                        Are you sure you want to {avatarActionLabel(confirmAction)}?
                                    </p>
                                    {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
                                    <div className="mt-5 flex justify-end gap-2">
                                        <button ref={confirmationCancel} type="button" onClick={() => setConfirmAction(null)} disabled={moderating} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void runConfirmedAction()}
                                            disabled={moderating}
                                            className={`inline-flex h-9 items-center gap-1 rounded-md px-4 text-xs disabled:opacity-40 ${avatarActionDestructive(confirmAction) ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}
                                        >
                                            {moderating ? <Loader2 className="size-4 animate-spin" /> : null} Confirm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {previewUrl ? (
                            <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Avatar gallery image">
                                <button
                                    ref={previewClose}
                                    type="button"
                                    onClick={closePreview}
                                    onKeyDown={(event) => {
                                        if (event.key === "Tab") {
                                            event.preventDefault();
                                            previewClose.current?.focus();
                                        }
                                    }}
                                    className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground"
                                    aria-label="Close image preview"
                                >
                                    <X className="size-5" />
                                </button>
                                <VrchatImage src={previewUrl} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" fallback={<ImageIcon className="size-12 text-muted-foreground" />} />
                            </div>
                        ) : null}
                    </>
                ) : null}
            </section>
        </div>
    );
}

const CONTENT_TAGS = ["horror", "gore", "violence", "adult", "sex"] as const;
const CONTENT_TAG_LABELS: Record<(typeof CONTENT_TAGS)[number], string> = { horror: "Horror", gore: "Gore", violence: "Violence", adult: "Adult", sex: "Sexual" };

function splitEditableTags(value: string) {
    return [
        ...new Set(
            value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
        ),
    ].slice(0, 32);
}

function toggleEditableTag(value: string, tag: string, enabled: boolean) {
    const tags = splitEditableTags(value).filter((item) => item !== tag);
    if (enabled) tags.push(tag);
    return tags.join(",");
}

function avatarActionLabel(action: AvatarConfirmAction) {
    const labels: Record<AvatarConfirmAction, string> = {
        block: "Block Avatar",
        "delete-avatar": "Delete",
        "delete-impostor": "Delete Impostor",
        "enqueue-impostor": "Create Impostor",
        "make-private": "Make Private",
        "make-public": "Make Public",
        "regenerate-impostor": "Regenerate Impostor",
        "select-fallback": "Select Fallback Avatar",
        unblock: "Unblock Avatar",
    };
    return labels[action];
}

function avatarActionStatus(action: AvatarConfirmAction) {
    const messages: Record<AvatarConfirmAction, string> = {
        block: "Avatar blocked",
        "delete-avatar": "Avatar deleted",
        "delete-impostor": "Impostor deleted",
        "enqueue-impostor": "Impostor queued",
        "make-private": "Avatar updated to private",
        "make-public": "Avatar updated to public",
        "regenerate-impostor": "Impostor regenerated",
        "select-fallback": "Fallback avatar changed",
        unblock: "Avatar unblocked",
    };
    return messages[action];
}

function avatarActionDestructive(action: AvatarConfirmAction) {
    return action === "block" || action === "delete-avatar" || action === "delete-impostor" || action === "regenerate-impostor";
}

function AvatarGallery({
    files,
    index,
    loading,
    uploading,
    error,
    inputRef,
    setIndex,
    refresh,
    upload,
    preview,
    isOwner,
}: {
    files: VrchatFile[];
    index: number;
    loading: boolean;
    uploading: boolean;
    error: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    setIndex: (index: number) => void;
    refresh: () => void;
    upload: (file: File) => void;
    preview: (url: string, trigger: HTMLButtonElement) => void;
    isOwner: boolean;
}) {
    const images = files.map((file) => ({ id: file.id, url: latestAvatarGalleryImageUrl(file) })).filter((image) => image.url);
    if (!images.length && !isOwner) return null;
    const selected = images[Math.min(index, Math.max(0, images.length - 1))];
    return (
        <section className="w-full px-1.5 py-2" aria-labelledby="avatar-gallery-title">
            <div className="flex items-center gap-2">
                <h3 id="avatar-gallery-title" className="truncate text-[13px] font-medium leading-[18px]">
                    Gallery
                </h3>
                {isOwner ? (
                    <>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) upload(file);
                            }}
                        />
                        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading || uploading} className="inline-flex h-7 items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-muted disabled:opacity-40">
                            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
                        </button>
                    </>
                ) : null}
                {error ? (
                    <button type="button" onClick={refresh} className="text-xs text-destructive underline">
                        Retry
                    </button>
                ) : null}
            </div>
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
            {selected ? (
                <div className="mx-auto mt-2 flex h-50 w-[80%] items-center gap-2">
                    <button type="button" onClick={() => setIndex((index - 1 + images.length) % images.length)} disabled={images.length < 2} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-input bg-background disabled:opacity-20" aria-label="Previous gallery image">
                        <ChevronLeft className="size-4" />
                    </button>
                    <button type="button" onClick={(event) => preview(selected.url, event.currentTarget)} className="min-w-0 flex-1 self-stretch" aria-label={`Open gallery image ${Math.min(index, images.length - 1) + 1} of ${images.length}`}>
                        <VrchatImage
                            src={selected.url}
                            alt=""
                            className="size-full object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            fallback={
                                <span className="flex size-full items-center justify-center bg-muted">
                                    <ImageIcon className="size-8 text-muted-foreground" />
                                </span>
                            }
                        />
                    </button>
                    <button type="button" onClick={() => setIndex((index + 1) % images.length)} disabled={images.length < 2} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-input bg-background disabled:opacity-20" aria-label="Next gallery image">
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            ) : loading ? (
                <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Loading gallery…
                </div>
            ) : null}
        </section>
    );
}

function AvatarListings({ avatar, preview }: { avatar: VrchatAvatar; preview: (url: string, trigger: HTMLButtonElement) => void }) {
    if (!avatar.publishedListings?.length) return null;
    return (
        <section className="w-full px-1.5 py-2" aria-labelledby="avatar-listings-title">
            <h3 id="avatar-listings-title" className="truncate text-[13px] font-medium leading-[18px]">
                Listings
            </h3>
            {avatar.publishedListings.map((listing, index) => {
                const imageUrl = `https://api.vrchat.cloud/api/1/file/${encodeURIComponent(listing.imageId)}/1/`;
                return (
                    <div key={listing.id || listing.listingId || `${listing.imageId}:${index}`} className="flex w-full items-center p-1.5 text-[13px]">
                        <button type="button" onClick={(event) => preview(imageUrl, event.currentTarget)} className="mr-2.5 size-9 shrink-0 overflow-hidden rounded-full" aria-label={`Open listing image for ${listing.displayName}`}>
                            <VrchatImage
                                src={imageUrl}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                fallback={
                                    <span className="flex size-full items-center justify-center bg-muted">
                                        <ImageIcon className="size-4 text-muted-foreground" />
                                    </span>
                                }
                            />
                        </button>
                        <div className="min-w-0 flex-1 overflow-hidden">
                            <span className="block truncate font-medium leading-[18px]">{listing.displayName}</span>
                            <span className="block truncate text-xs italic underline">${new Intl.NumberFormat("en").format(listing.priceTokens)}V</span>
                            <span className="block text-xs break-words">{listing.description}</span>
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

function AvatarInfo({ avatar, copied, copy }: { avatar: VrchatAvatar; copied: string; copy: (value: string, label: string) => Promise<void> }) {
    const packages = avatarPlatforms(avatar);
    return (
        <div className="flex flex-wrap items-start px-1">
            <MemoField entityType="avatar" entityId={avatar.id} />
            <Info label="Avatar ID" value={copied === "ID" ? "Copied" : avatar.id} action={() => void copy(avatar.id, "ID")} full />
            <Info label="Created" value={date(avatar.created_at)} />
            <Info label="Last updated" value={date(avatar.updated_at)} />
            <Info label="Version" value={avatar.version ? String(avatar.version) : "—"} />
            <Info label="Visibility" value={avatar.releaseStatus || "private"} />
            <Info label="Platform" value={packages.map((item) => `${platformLabel(item.platform)}${item.performanceRating ? ` (${item.performanceRating})` : ""}`).join(", ") || "—"} full />
        </div>
    );
}

function avatarPlatforms(avatar: VrchatAvatar | null) {
    if (!avatar) return [];
    return Array.from(new Map((avatar.unityPackages || []).filter((item) => item.variant !== "impostor").map((item) => [item.platform, item])).values());
}

function PlatformBadge({ platform, rating }: { platform: string; rating?: string }) {
    const Icon = platform === "standalonewindows" ? Monitor : platform === "android" ? Smartphone : Apple;
    return (
        <Badge>
            <Icon className="size-3" />
            {platformLabel(platform)}
            {rating ? <span className="border-l border-border pl-1">{rating}</span> : null}
        </Badge>
    );
}

function platformLabel(value: string) {
    return value === "standalonewindows" ? "PC" : value === "android" ? "Quest" : value === "ios" ? "iOS" : value;
}

function Badge({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 capitalize">{children}</span>;
}

function Info({ label, value, action, full = false }: { label: string; value: string; action?: () => void; full?: boolean }) {
    const content = (
        <>
            <span className="block truncate font-medium leading-[18px]">{label}</span>
            <span className="block truncate text-xs">{value}</span>
        </>
    );
    const className = `box-border min-w-0 p-1.5 text-left text-[13px] ${full ? "w-full" : "w-[167px]"}`;
    return action ? (
        <button type="button" onClick={action} className={`${className} hover:rounded hover:bg-muted`}>
            {content}
        </button>
    ) : (
        <div className={className}>{content}</div>
    );
}

function date(value?: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}
