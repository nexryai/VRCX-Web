"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Activity, Bell, BookUser, Clock, MapPin, Search, ShieldUser, Star, Users } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { FriendAvatar } from "@/components/friends/friend-avatar";
import { useFriends } from "@/components/friends/friends-provider";
import { ACTIVITY_UPDATED_EVENT, type FriendActivity, readActivityLog } from "@/lib/activity-log";
import { locationLabel } from "@/lib/friends";

const shortcuts = [
    { href: "/notification", label: "Notifications", icon: Bell },
    { href: "/favorite/friends", label: "Favorites", icon: Star },
    { href: "/social/friend-list", label: "Friend List", icon: BookUser },
    { href: "/search", label: "Search", icon: Search },
    { href: "/social/moderation", label: "Moderation", icon: ShieldUser },
];

function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { timeStyle: "short", dateStyle: "short" }).format(date);
}

export function DashboardView() {
    const currentUser = useCurrentUser();
    const { friends, allFriends, loading, openUser } = useFriends();
    const [activity, setActivity] = useState<FriendActivity[]>([]);
    const loadActivity = useCallback(() => setActivity(readActivityLog(currentUser.id)), [currentUser.id]);

    useEffect(() => {
        loadActivity();
        window.addEventListener(ACTIVITY_UPDATED_EVENT, loadActivity);
        window.addEventListener("storage", loadActivity);
        return () => {
            window.removeEventListener(ACTIVITY_UPDATED_EVENT, loadActivity);
            window.removeEventListener("storage", loadActivity);
        };
    }, [loadActivity]);

    const locationStats = useMemo(() => {
        let privateCount = 0;
        let travelingCount = 0;
        for (const friend of friends) {
            if (friend.location === "traveling" || friend.travelingToLocation) travelingCount += 1;
            else if (!friend.location || friend.location === "private" || friend.location === "offline") privateCount += 1;
        }
        return { privateCount, travelingCount, visibleCount: Math.max(0, friends.length - privateCount - travelingCount) };
    }, [friends]);

    return (
        <section className="h-full overflow-y-auto p-3 sm:p-4" aria-labelledby="dashboard-heading">
            <h1 id="dashboard-heading" className="sr-only">
                Dashboard
            </h1>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <DashboardPanel title="Friends" icon={Users} href="/social/friend-list" className="lg:col-span-2 xl:col-span-1">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                        <Stat label="Online" value={friends.length} />
                        <Stat label="Total" value={allFriends.length} />
                        <Stat label="Visible worlds" value={locationStats.visibleCount} />
                        <Stat label="Private / traveling" value={locationStats.privateCount + locationStats.travelingCount} />
                    </div>
                </DashboardPanel>

                <DashboardPanel title="Online Friends" icon={MapPin} href="/">
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                        {loading ? <p className="py-8 text-center text-xs text-muted-foreground">Loading friends…</p> : null}
                        {!loading && !friends.length ? <p className="py-8 text-center text-xs text-muted-foreground">No friends are online.</p> : null}
                        {friends.slice(0, 12).map((friend) => (
                            <button type="button" key={friend.id} onClick={() => openUser(friend.id)} className="flex w-full min-w-0 items-center gap-2 rounded-md p-1.5 text-left hover:bg-muted">
                                <FriendAvatar friend={friend} size="sm" />
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium">{friend.displayName}</span>
                                    <span className="block truncate text-[10px] text-muted-foreground">{locationLabel(friend)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </DashboardPanel>

                <DashboardPanel title="Recent Feed" icon={Activity} href="/feed">
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                        {!activity.length ? <p className="py-8 text-center text-xs text-muted-foreground">No remotely observed changes yet.</p> : null}
                        {activity.slice(0, 12).map((entry) => (
                            <button type="button" key={entry.id} onClick={() => openUser(entry.userId)} className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted">
                                <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs">
                                        <strong>{entry.displayName}</strong> · {entry.type}
                                    </span>
                                    <span className="block text-[10px] text-muted-foreground">{formatTime(entry.createdAt)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </DashboardPanel>

                <DashboardPanel title="Quick Access" icon={Star} className="lg:col-span-2 xl:col-span-1">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                        {shortcuts.map((shortcut) => {
                            const Icon = shortcut.icon;
                            return (
                                <Link key={shortcut.href} href={shortcut.href} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs hover:bg-muted">
                                    <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                                    {shortcut.label}
                                </Link>
                            );
                        })}
                    </div>
                </DashboardPanel>
            </div>
        </section>
    );
}

function DashboardPanel({ title, icon: Icon, href, className = "", children }: { title: string; icon: typeof Users; href?: string; className?: string; children: React.ReactNode }) {
    return (
        <article className={`min-h-0 rounded-xl border border-border bg-card p-3 shadow-xs ${className}`}>
            <header className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold">{title}</h2>
                {href ? (
                    <Link href={href} className="ml-auto text-[10px] text-primary hover:underline">
                        Open
                    </Link>
                ) : null}
            </header>
            {children}
        </article>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
        </div>
    );
}
