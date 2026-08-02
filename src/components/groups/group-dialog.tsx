"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Clipboard, ExternalLink, ImageIcon, Loader2, RefreshCw, ShieldCheck, Users, X } from "lucide-react";

import { FriendAvatar } from "@/components/friends/friend-avatar";
import { locationLabel } from "@/lib/friends";
import type { VrchatGroup, VrchatUser } from "@/lib/vrchat/types";

type GroupTab = "Info" | "JSON";

export function GroupDialog({ groupId, friends, openUser, onClose }: { groupId: string; friends: VrchatUser[]; openUser: (userId: string) => void; onClose: () => void }) {
    const [group, setGroup] = useState<VrchatGroup | null>(null);
    const [ownerName, setOwnerName] = useState("");
    const [tab, setTab] = useState<GroupTab>("Info");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const closeButton = useRef<HTMLButtonElement>(null);

    const load = useCallback(
        async (refresh = false) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
                const payload = (await response.json()) as { error?: string; group?: VrchatGroup };
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.group) throw new Error(payload.error || "The group could not be loaded.");
                setGroup(payload.group);
                setOwnerName(payload.group.ownerId || "");
                if (payload.group.ownerId) {
                    void fetch(`/api/users/${encodeURIComponent(payload.group.ownerId)}`, { cache: "no-store" })
                        .then(async (ownerResponse) => (await ownerResponse.json()) as { user?: VrchatUser })
                        .then((ownerPayload) => setOwnerName(ownerPayload.user?.displayName || payload.group?.ownerId || ""))
                        .catch(() => undefined);
                }
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "The group could not be loaded.");
            } finally {
                setLoading(false);
            }
        },
        [groupId],
    );

    useEffect(() => {
        setGroup(null);
        setOwnerName("");
        setTab("Info");
        void load();
        closeButton.current?.focus();
    }, [load]);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    async function copy(value: string) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
    }

    const groupFriends = useMemo(() => friends.filter((friend) => friend.location?.includes(`~group(${groupId})`)), [friends, groupId]);
    return (
        <div className="fixed inset-0 z-[83] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close group details" />
            <section role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-background p-3 shadow-2xl sm:h-[min(88dvh,780px)] sm:max-w-[892px] sm:rounded-xl sm:border sm:p-4">
                <button ref={closeButton} type="button" onClick={onClose} className="absolute top-2 right-2 z-40 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow hover:text-foreground" aria-label="Close">
                    <X className="size-4" />
                </button>
                {loading && !group ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Loading group…
                    </div>
                ) : null}
                {!loading && !group ? <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div> : null}
                {group ? (
                    <>
                        <header className="flex shrink-0 flex-col gap-3 pr-8 sm:flex-row sm:pr-10">
                            <div className="flex size-[120px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                                {group.iconUrl ? <img src={group.iconUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon className="size-8 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="group-dialog-title" className="break-words font-bold">
                                    {group.name}
                                </h2>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {group.shortCode || "GROUP"}
                                    {group.discriminator ? `.${group.discriminator}` : ""}
                                </p>
                                {group.ownerId ? (
                                    <button type="button" onClick={() => openUser(group.ownerId || "")} className="mt-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                                        {ownerName || group.ownerId}
                                    </button>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                                    {group.isVerified ? <Badge icon={<ShieldCheck className="size-3" />}>Verified</Badge> : null}
                                    <Badge>{group.privacy === "default" ? "public" : group.privacy || "unknown"}</Badge>
                                    {group.joinState ? <Badge>{group.joinState}</Badge> : null}
                                    {group.membershipStatus === "member" || group.myMember?.membershipStatus === "member" ? <Badge>Joined</Badge> : null}
                                    {group.myMember?.visibility ? <Badge>{group.myMember.visibility}</Badge> : null}
                                    {(group.languages || []).map((language) => (
                                        <Badge key={language}>{language.toUpperCase()}</Badge>
                                    ))}
                                </div>
                                {group.description && group.description !== group.name ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs">{group.description}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-end gap-2 sm:mt-12 sm:items-start">
                                <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex size-9 items-center justify-center rounded-full border border-input hover:bg-muted disabled:opacity-40" aria-label="Refresh group">
                                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                                </button>
                                <button type="button" onClick={() => void copy(`https://vrchat.com/home/group/${group.id}`)} className="inline-flex h-9 items-center gap-1 rounded-full border border-input px-3 text-xs">
                                    <Clipboard className="size-4" /> {copied ? "Copied" : "Share"}
                                </button>
                                <a href={`https://vrchat.com/home/group/${encodeURIComponent(group.id)}`} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-full border border-input" aria-label="Open on VRChat">
                                    <ExternalLink className="size-4" />
                                </a>
                            </div>
                        </header>
                        {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                        <div className="mt-3 flex shrink-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Group details">
                            {(["Info", "JSON"] as GroupTab[]).map((item) => (
                                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 flex-1 shrink-0 border-b-2 px-4 text-xs ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-card p-3">
                            {tab === "Info" ? <GroupInfo group={group} friends={groupFriends} openUser={openUser} copy={copy} /> : null}
                            {tab === "JSON" ? <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[10px] leading-5">{JSON.stringify(group, null, 2)}</pre> : null}
                        </div>
                    </>
                ) : null}
            </section>
        </div>
    );
}

function GroupInfo({ group, friends, openUser, copy }: { group: VrchatGroup; friends: VrchatUser[]; openUser: (userId: string) => void; copy: (value: string) => Promise<void> }) {
    const instances = Array.from(new Set(friends.map((friend) => friend.location).filter((location): location is string => Boolean(location))));
    return (
        <div>
            {group.bannerUrl ? (
                <img src={group.bannerUrl} alt="" className="aspect-[6/1] w-full rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
                <div className="flex aspect-[6/1] w-full items-center justify-center rounded-md bg-muted">
                    <ImageIcon className="size-8 text-muted-foreground" />
                </div>
            )}
            {instances.length ? (
                <section className="mt-3">
                    <h3 className="px-1.5 text-xs font-bold">Instances</h3>
                    {instances.map((location) => (
                        <div key={location} className="mt-2 rounded-lg bg-background p-2">
                            <p className="break-all text-xs text-muted-foreground">{locationLabel(friends.find((friend) => friend.location === location) || friends[0])}</p>
                            <div className="mt-1 flex flex-wrap">
                                {friends
                                    .filter((friend) => friend.location === location)
                                    .map((friend) => (
                                        <button key={friend.id} type="button" onClick={() => openUser(friend.id)} className="flex w-[167px] items-center gap-2.5 rounded p-1.5 text-left text-[13px] hover:bg-muted">
                                            <FriendAvatar friend={friend} size="sm" />
                                            <span className="min-w-0 truncate font-medium">{friend.displayName}</span>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}
            <div className="mt-3 flex flex-wrap items-start px-1">
                <FullInfo label="Rules" value={group.rules || "—"} />
                <Info label="Members" value={`${number(group.memberCount)} (${number(group.onlineMemberCount)})`} icon={<Users className="size-3.5" />} />
                <Info label="Created" value={date(group.createdAt)} />
                <Info label="Join state" value={group.joinState || "—"} />
                <Info label="Privacy" value={group.privacy === "default" ? "public" : group.privacy || "—"} />
                <Info label="Roles" value={number(group.roles?.length)} />
                <FullInfo label="Links" value={(group.links || []).filter((link) => safeUrl(link)).join("\n") || "—"} links={(group.links || []).filter((link) => safeUrl(link))} />
                <Info label="URL" value={`https://vrchat.com/home/group/${group.id}`} action={() => void copy(`https://vrchat.com/home/group/${group.id}`)} />
                <Info label="Group ID" value={group.id} action={() => void copy(group.id)} />
            </div>
            {group.roles?.length ? (
                <section className="mt-3 px-2 text-xs">
                    <h3 className="font-medium">Roles</h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.roles.map((role) => (
                            <Badge key={role.id}>{role.name}</Badge>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function Badge({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 capitalize">
            {icon}
            {children}
        </span>
    );
}

function Info({ label, value, icon, action }: { label: string; value: string; icon?: React.ReactNode; action?: () => void }) {
    const content = (
        <>
            <span className="flex items-center gap-1 truncate font-medium leading-[18px]">
                {icon}
                {label}
            </span>
            <span className="block truncate text-xs">{value}</span>
        </>
    );
    return action ? (
        <button type="button" onClick={action} className="box-border w-[167px] p-1.5 text-left text-[13px] hover:rounded hover:bg-muted">
            {content}
        </button>
    ) : (
        <div className="box-border w-[167px] p-1.5 text-[13px]">{content}</div>
    );
}

function FullInfo({ label, value, links }: { label: string; value: string; links?: string[] }) {
    return (
        <div className="box-border w-full p-1.5 text-[13px]">
            <span className="block font-medium leading-[18px]">{label}</span>
            {links?.length ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {links.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noreferrer" className="max-w-full truncate text-xs text-primary hover:underline">
                            {link}
                        </a>
                    ))}
                </div>
            ) : (
                <span className="block whitespace-pre-wrap text-xs">{value}</span>
            )}
        </div>
    );
}

function safeUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function number(value?: number) {
    return value === undefined ? "—" : new Intl.NumberFormat("en").format(value);
}

function date(value?: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(parsed);
}
