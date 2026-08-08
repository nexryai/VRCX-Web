"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Apple, CheckCircle, Clipboard, ExternalLink, ImageIcon, Loader2, Monitor, RefreshCw, Smartphone, X } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FavoriteAction } from "@/components/favorite-action";
import { MemoField } from "@/components/memo-field";
import type { VrchatAvatar } from "@/lib/vrchat/types";

type AvatarTab = "Info" | "JSON";

export function AvatarDialog({ avatarId, openUser, onClose }: { avatarId: string; openUser: (userId: string) => void; onClose: () => void }) {
    const currentUser = useCurrentUser();
    const [avatar, setAvatar] = useState<VrchatAvatar | null>(null);
    const [tab, setTab] = useState<AvatarTab>("Info");
    const [loading, setLoading] = useState(true);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState(currentUser.currentAvatar === avatarId);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");
    const closeButton = useRef<HTMLButtonElement>(null);

    const load = useCallback(
        async (refresh = false) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/avatars/${encodeURIComponent(avatarId)}${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; avatar?: VrchatAvatar };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.avatar) throw new Error(payload.error || "The avatar could not be loaded.");
                setAvatar(payload.avatar);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "The avatar could not be loaded.");
            } finally {
                setLoading(false);
            }
        },
        [avatarId],
    );

    useEffect(() => {
        setAvatar(null);
        setTab("Info");
        setSelected(currentUser.currentAvatar === avatarId);
        void load();
        closeButton.current?.focus();
    }, [avatarId, currentUser.currentAvatar, load]);

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

    const platforms = useMemo(() => avatarPlatforms(avatar), [avatar]);
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
                                {avatar.thumbnailImageUrl || avatar.imageUrl ? <img src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon className="size-8 text-muted-foreground" />}
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
                                <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40" aria-label="Refresh avatar">
                                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                                </button>
                                <button type="button" onClick={() => void copy(`https://vrchat.com/home/avatar/${avatar.id}`, "URL")} className="inline-flex h-9 items-center gap-1 rounded-full border border-input px-3 text-xs">
                                    <Clipboard className="size-4" />
                                    {copied === "URL" ? "Copied" : "Share"}
                                </button>
                                <a href={`https://vrchat.com/home/avatar/${encodeURIComponent(avatar.id)}`} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-full border border-input" aria-label="Open on VRChat">
                                    <ExternalLink className="size-4" />
                                </a>
                            </div>
                        </header>
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Avatar details">
                            {(["Info", "JSON"] as AvatarTab[]).map((item) => (
                                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 flex-1 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tab === "Info" ? <AvatarInfo avatar={avatar} copied={copied} copy={copy} /> : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(avatar, null, 2)}</pre> : null}
                        </div>
                    </>
                ) : null}
            </section>
        </div>
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
