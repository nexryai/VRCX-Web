"use client";

import { useEffect, useRef, useState } from "react";

import { CalendarDays, Clipboard, ExternalLink, Link as LinkIcon, Loader2, LogIn, MapPin, ShieldCheck, Trash2, UserRound, X } from "lucide-react";

import { friendImage, locationLabel, statusColor } from "@/lib/friends";
import type { VrchatUser } from "@/lib/vrchat/types";
import { useFriends } from "./friends-provider";

function formatDate(value?: string) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeExternalUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
        return "";
    }
}

export function UserDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
    const { removeFriend } = useFriends();
    const [user, setUser] = useState<VrchatUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [copied, setCopied] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`/api/users/${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const payload = (await response.json()) as { error?: string; user?: VrchatUser };
                if (!response.ok || !payload.user) throw new Error(payload.error || "The user could not be loaded.");
                setUser(payload.user);
            })
            .catch((requestError) => {
                if (requestError instanceof DOMException && requestError.name === "AbortError") return;
                setError(requestError instanceof Error ? requestError.message : "The user could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [userId]);

    useEffect(() => {
        closeButtonRef.current?.focus();
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    async function copyUserId() {
        await navigator.clipboard.writeText(userId);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    }

    async function unfriend() {
        if (!user) return;
        setRemoving(true);
        setError("");
        try {
            const response = await fetch(`/api/friends/${encodeURIComponent(user.id)}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "The friend could not be removed.");
            removeFriend(user.id);
            onClose();
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "The friend could not be removed.");
            setConfirming(false);
        } finally {
            setRemoving(false);
        }
    }

    const image = user ? friendImage(user) : "";
    const profileUrl = `https://vrchat.com/home/user/${encodeURIComponent(userId)}`;

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close user details" />
            <section role="dialog" aria-modal="true" aria-labelledby="user-dialog-title" className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden border-border bg-background shadow-2xl sm:max-h-[min(88dvh,760px)] sm:max-w-4xl sm:rounded-xl sm:border">
                <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                    <h2 id="user-dialog-title" className="truncate text-sm font-semibold">
                        {user?.displayName || "User details"}
                    </h2>
                    <button ref={closeButtonRef} type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                        <X aria-hidden="true" className="size-4" />
                    </button>
                </header>

                {loading ? (
                    <div className="flex min-h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                        Loading user…
                    </div>
                ) : null}
                {!loading && error && !user ? (
                    <div className="flex min-h-96 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                        <p className="max-w-md text-destructive">{error}</p>
                        <button type="button" onClick={onClose} className="rounded-md bg-secondary px-4 py-2">
                            Close
                        </button>
                    </div>
                ) : null}
                {!loading && user ? (
                    <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[19rem_minmax(0,1fr)] md:overflow-hidden">
                        <aside className="flex flex-col items-center border-b border-border bg-card p-5 text-center md:overflow-y-auto md:border-r md:border-b-0">
                            <span className="relative inline-flex size-28">
                                <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground shadow-lg">
                                    {image ? <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <UserRound aria-hidden="true" className="size-10" />}
                                </span>
                                <span className="absolute right-1 bottom-1 size-4 rounded-full border-[3px] border-card" style={{ backgroundColor: statusColor(user.status) }} aria-hidden="true" />
                            </span>
                            <h3 className="mt-3 max-w-full truncate text-lg font-bold">{user.displayName}</h3>
                            {user.pronouns ? <p className="text-xs text-muted-foreground">{user.pronouns}</p> : null}
                            <p className="mt-1 text-xs capitalize text-muted-foreground">{user.state || user.status || "Offline"}</p>
                            {user.statusDescription ? <p className="mt-3 w-full rounded-lg bg-muted p-2 text-xs">{user.statusDescription}</p> : null}
                            {user.representedGroup?.name ? (
                                <div className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left">
                                    {user.representedGroup.iconUrl ? <img src={user.representedGroup.iconUrl} alt="" className="size-8 rounded-md object-cover" referrerPolicy="no-referrer" /> : <ShieldCheck aria-hidden="true" className="size-5 text-primary" />}
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-medium">{user.representedGroup.name}</p>
                                        {user.representedGroup.shortCode ? <p className="text-[10px] text-muted-foreground">{user.representedGroup.shortCode}</p> : null}
                                    </div>
                                </div>
                            ) : null}
                            <div className="mt-4 grid w-full grid-cols-2 gap-2">
                                <button type="button" onClick={() => void copyUserId()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-secondary px-2 text-xs hover:opacity-85">
                                    <Clipboard aria-hidden="true" className="size-3.5" />
                                    {copied ? "Copied" : "Copy ID"}
                                </button>
                                <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-secondary px-2 text-xs hover:opacity-85">
                                    <ExternalLink aria-hidden="true" className="size-3.5" />
                                    VRChat
                                </a>
                            </div>
                            {user.isFriend !== false ? (
                                confirming ? (
                                    <div className="mt-3 w-full rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
                                        <p>Remove {user.displayName} from your friends?</p>
                                        <div className="mt-2 flex gap-2">
                                            <button type="button" onClick={() => setConfirming(false)} className="h-8 flex-1 rounded-md bg-secondary" disabled={removing}>
                                                Cancel
                                            </button>
                                            <button type="button" onClick={() => void unfriend()} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-destructive text-white" disabled={removing}>
                                                {removing ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                                                Unfriend
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setConfirming(true)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10">
                                        <Trash2 aria-hidden="true" className="size-3.5" />
                                        Unfriend
                                    </button>
                                )
                            ) : null}
                        </aside>

                        <div className="min-h-0 space-y-3 p-3 sm:p-4 md:overflow-y-auto">
                            {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p> : null}
                            <section className="rounded-xl bg-card p-3">
                                <h3 className="mb-2 border-b border-border pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Current instance</h3>
                                <div className="flex gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-start gap-1.5 text-sm">
                                            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                                            <span className="break-all">{locationLabel(user)}</span>
                                        </p>
                                        {user.location && !["private", "offline", "traveling"].includes(user.location) ? <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{user.location}</p> : null}
                                    </div>
                                    {user.world?.thumbnailImageUrl ? <img src={user.world.thumbnailImageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}
                                </div>
                            </section>

                            <section className="rounded-xl bg-card p-3">
                                <h3 className="mb-2 border-b border-border pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Bio</h3>
                                <p className="whitespace-pre-wrap text-sm text-foreground/90">{user.bio || "No bio provided."}</p>
                                {user.bioLinks?.length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {user.bioLinks.map((link) => {
                                            const href = safeExternalUrl(link);
                                            return href ? (
                                                <a key={link} href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-primary hover:underline">
                                                    <LinkIcon aria-hidden="true" className="size-3 shrink-0" />
                                                    <span className="truncate">{link}</span>
                                                </a>
                                            ) : null;
                                        })}
                                    </div>
                                ) : null}
                            </section>

                            <section className="grid gap-2 sm:grid-cols-2">
                                <InfoCard icon={<CalendarDays aria-hidden="true" className="size-4" />} label="Joined VRChat" value={formatDate(user.date_joined)} />
                                <InfoCard icon={<LogIn aria-hidden="true" className="size-4" />} label="Last login" value={formatDate(user.last_login || user.last_activity)} />
                            </section>

                            {user.badges?.length ? (
                                <section className="rounded-xl bg-card p-3">
                                    <h3 className="mb-2 border-b border-border pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Badges</h3>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {user.badges.map((badge) => (
                                            <div key={`${badge.badgeName || "badge"}-${badge.badgeImageUrl || badge.badgeDescription || "item"}`} className="flex items-center gap-2 rounded-lg bg-muted/60 p-2">
                                                {badge.badgeImageUrl ? <img src={badge.badgeImageUrl} alt="" className="size-9 rounded-md object-contain" referrerPolicy="no-referrer" /> : <ShieldCheck aria-hidden="true" className="size-5 text-primary" />}
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-medium">{badge.badgeName || "Badge"}</p>
                                                    {badge.badgeDescription ? <p className="line-clamp-2 text-[10px] text-muted-foreground">{badge.badgeDescription}</p> : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-xl bg-card p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                {icon}
                {label}
            </p>
            <p className="mt-1 text-xs">{value}</p>
        </div>
    );
}
