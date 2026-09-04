"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Repeat, Search, Share2, Star } from "lucide-react";

import { useFriends } from "@/components/friends/friends-provider";
import { ToolsDialogFrame } from "@/components/tools/tools-dialog-frame";
import { VrchatImage } from "@/components/vrchat-image";
import { calendarDateKey, calendarMonthFromDate, mergeCalendarEvents, toolsGroupCalendarPayloadSchema } from "@/lib/group-calendar";
import type { VrchatGroup, VrchatGroupCalendarEvent, VrchatGroupCalendarInterestUpdate } from "@/lib/vrchat/types";

type CalendarView = "timeline" | "list";

export function GroupCalendarDialog({ close }: { close: () => void }) {
    const { openGroup } = useFriends();
    const [selectedDay, setSelectedDay] = useState(() => new Date());
    const [events, setEvents] = useState<VrchatGroupCalendarEvent[]>([]);
    const [followingEvents, setFollowingEvents] = useState<VrchatGroupCalendarEvent[]>([]);
    const [featuredEvents, setFeaturedEvents] = useState<VrchatGroupCalendarEvent[]>([]);
    const [groups, setGroups] = useState<Record<string, VrchatGroup>>({});
    const [showFeatured, setShowFeatured] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [view, setView] = useState<CalendarView>("timeline");
    const [search, setSearch] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const controller = useRef<AbortController | null>(null);
    const selectedMonth = calendarMonthFromDate(selectedDay);

    const load = useCallback(async (month: string, featured: boolean, refresh = false) => {
        controller.current?.abort();
        const nextController = new AbortController();
        controller.current = nextController;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/tools/group-calendar?month=${month}&featured=${featured}${refresh ? "&refresh=true" : ""}`, { cache: "no-store", signal: nextController.signal });
            const payload: unknown = await response.json();
            if (response.status === 401) {
                window.location.assign("/login");
                return;
            }
            if (!response.ok) throw new Error(readError(payload, "The group calendar could not be loaded."));
            const parsed = toolsGroupCalendarPayloadSchema.safeParse(payload);
            if (!parsed.success) throw new Error("The group calendar response was not valid.");
            setEvents(parsed.data.events);
            setFollowingEvents(parsed.data.followingEvents);
            setFeaturedEvents(parsed.data.featuredEvents);
            setGroups(parsed.data.groups);
        } catch (loadError) {
            if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "The group calendar could not be loaded.");
        } finally {
            if (!nextController.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const settingsController = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: settingsController.signal })
            .then((response) => response.json() as Promise<{ groupCalendarShowFeaturedEvents?: boolean }>)
            .then((settings) => {
                const featured = settings.groupCalendarShowFeaturedEvents === true;
                setShowFeatured(featured);
                setSettingsLoaded(true);
                return load(selectedMonth, featured);
            })
            .catch((settingsError) => {
                if (!(settingsError instanceof DOMException && settingsError.name === "AbortError")) {
                    setSettingsLoaded(true);
                    void load(selectedMonth, false);
                }
            });
        return () => {
            settingsController.abort();
            controller.current?.abort();
        };
    }, [load, selectedMonth]);

    async function toggleFeatured() {
        const next = !showFeatured;
        setShowFeatured(next);
        await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupCalendarShowFeaturedEvents: next }) });
        await load(selectedMonth, next);
    }

    function changeMonth(offset: number) {
        setSelectedDay((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    }

    function selectGroup(groupId: string) {
        close();
        requestAnimationFrame(() => openGroup(groupId));
    }

    function updateFollow(updated: VrchatGroupCalendarInterestUpdate) {
        const patch = (event: VrchatGroupCalendarEvent) => (event.id === updated.id ? { ...event, userInterest: updated.userInterest } : event);
        setEvents((current) => current.map(patch));
        setFeaturedEvents((current) => current.map(patch));
        setFollowingEvents((current) => {
            const without = current.filter((event) => event.id !== updated.id);
            if (!updated.userInterest.isFollowing) return without;
            const event = [...events, ...featuredEvents].find((candidate) => candidate.id === updated.id);
            return event ? [...without, { ...event, userInterest: updated.userInterest }] : without;
        });
    }

    const visibleEvents = useMemo(() => mergeCalendarEvents(events, showFeatured ? featuredEvents : []), [events, featuredEvents, showFeatured]);
    const followingIds = useMemo(() => new Set(followingEvents.map((event) => event.id)), [followingEvents]);
    const dayEvents = visibleEvents.filter((event) => calendarDateKey(event.startsAt) === calendarDateKey(selectedDay));
    const groupRows = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        const byGroup = new Map<string, VrchatGroupCalendarEvent[]>();
        for (const event of visibleEvents) {
            if (calendarMonthFromDate(new Date(event.startsAt)) !== calendarMonthFromDate(selectedDay)) continue;
            const groupName = groups[event.ownerId]?.name || event.ownerId;
            if (query && !groupName.toLocaleLowerCase().includes(query) && !event.title.toLocaleLowerCase().includes(query) && !event.description.toLocaleLowerCase().includes(query)) continue;
            const row = byGroup.get(event.ownerId) || [];
            row.push(event);
            byGroup.set(event.ownerId, row);
        }
        return [...byGroup.entries()].map(([groupId, rowEvents]) => ({ groupId, groupName: groups[groupId]?.name || groupId, events: rowEvents.toSorted((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
    }, [groups, search, selectedDay, visibleEvents]);

    return (
        <ToolsDialogFrame title="Group Calendar" close={close} calendar>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <label className="mr-1 inline-flex min-h-9 items-center gap-2 text-xs">
                    Featured Events
                    <button type="button" role="switch" aria-checked={showFeatured} disabled={!settingsLoaded || loading} onClick={() => void toggleFeatured()} className={`relative h-5 w-9 rounded-full border border-border transition-colors ${showFeatured ? "bg-primary" : "bg-muted"}`}>
                        <span className={`absolute top-0.5 size-3.5 rounded-full bg-white transition-transform ${showFeatured ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                </label>
                <button type="button" onClick={() => setView((current) => (current === "timeline" ? "list" : "timeline"))} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted">
                    {view === "timeline" ? "List View" : "Calendar View"}
                </button>
            </div>
            {error ? <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div> : null}
            <div className="mt-3 h-[min(640px,calc(100dvh-9rem))] min-h-[360px] overflow-hidden">
                {view === "timeline" ? (
                    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(200px,1fr)_360px]">
                        <div className="min-h-0 overflow-y-auto px-2 pb-4">{loading && !visibleEvents.length ? <Loading /> : dayEvents.length ? <Timeline events={dayEvents} groups={groups} followingIds={followingIds} updateFollow={updateFollow} selectGroup={selectGroup} /> : <Empty label="No events found" />}</div>
                        <MonthCalendar selected={selectedDay} events={visibleEvents} followingIds={followingIds} changeMonth={changeMonth} select={setSelectedDay} />
                    </div>
                ) : (
                    <div className="flex h-full min-h-0 flex-col">
                        <label className="relative ml-auto block w-full max-w-[300px]">
                            <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups or events..." className="h-8 w-full rounded-md border border-input bg-background pr-3 pl-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </label>
                        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 py-1">
                            {loading && !visibleEvents.length ? (
                                <Loading />
                            ) : groupRows.length ? (
                                groupRows.map((row) => {
                                    const isCollapsed = collapsed.has(row.groupId) && !search.trim();
                                    return (
                                        <section key={row.groupId} className="mb-[18px]">
                                            <button type="button" onClick={() => setCollapsed((current) => toggleSet(current, row.groupId))} aria-expanded={!isCollapsed} className="mb-2 flex w-full items-center rounded-md px-3 py-1 text-left text-base font-bold hover:bg-muted">
                                                <ChevronDown className={`mr-2 size-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} /> {row.groupName}
                                            </button>
                                            {!isCollapsed ? (
                                                <div className="flex flex-wrap gap-4">
                                                    {row.events.map((event) => (
                                                        <CalendarEventCard key={event.id} event={event} group={groups[event.ownerId]} following={followingIds.has(event.id)} updateFollow={updateFollow} selectGroup={selectGroup} mode="list" />
                                                    ))}
                                                </div>
                                            ) : null}
                                        </section>
                                    );
                                })
                            ) : (
                                <Empty label={search.trim() ? "No matching events found" : "No events this month"} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </ToolsDialogFrame>
    );
}

function Timeline({ events, groups, followingIds, updateFollow, selectGroup }: { events: VrchatGroupCalendarEvent[]; groups: Record<string, VrchatGroup>; followingIds: Set<string>; updateFollow: (event: VrchatGroupCalendarInterestUpdate) => void; selectGroup: (groupId: string) => void }) {
    const grouped = new Map<string, VrchatGroupCalendarEvent[]>();
    for (const event of events) {
        const key = timeOnly(event.startsAt);
        grouped.set(key, [...(grouped.get(key) || []), event]);
    }
    return [...grouped.entries()].map(([time, timeEvents]) => (
        <section key={time} className="mb-3 pb-2">
            <h3 className="mb-2 text-[13px] font-semibold">
                {shortDay(timeEvents[0].startsAt)} {time}
            </h3>
            <div className="flex flex-col gap-2">
                {timeEvents.map((event) => (
                    <CalendarEventCard key={event.id} event={event} group={groups[event.ownerId]} following={followingIds.has(event.id)} updateFollow={updateFollow} selectGroup={selectGroup} mode="timeline" />
                ))}
            </div>
        </section>
    ));
}

function CalendarEventCard({ event, group, following, updateFollow, selectGroup, mode }: { event: VrchatGroupCalendarEvent; group?: VrchatGroup; following: boolean; updateFollow: (event: VrchatGroupCalendarInterestUpdate) => void; selectGroup: (groupId: string) => void; mode: CalendarView }) {
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState("");
    async function follow() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(event.ownerId)}/calendar/${encodeURIComponent(event.id)}/follow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFollowing: !following }) });
            const payload = (await response.json()) as { error?: string; event?: VrchatGroupCalendarInterestUpdate };
            if (!response.ok || !payload.event) throw new Error(payload.error || "The event follow state could not be updated.");
            updateFollow(payload.event);
        } catch (followError) {
            setError(followError instanceof Error ? followError.message : "The event follow state could not be updated.");
        } finally {
            setBusy(false);
        }
    }
    async function copy() {
        await navigator.clipboard.writeText(`https://vrchat.com/home/group/${event.ownerId}/calendar/${event.id}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
    }
    async function download() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(event.ownerId)}/calendar/${encodeURIComponent(event.id)}/ics`, { cache: "no-store" });
            if (!response.ok) throw new Error(readError(await response.json().catch(() => null), "The calendar file could not be downloaded."));
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${event.id}.ics`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "The calendar file could not be downloaded.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <article className={`relative overflow-hidden rounded-lg border border-border bg-card hover:bg-accent ${mode === "list" ? "w-full max-w-[320px]" : "w-full"}`}>
            <VrchatImage
                src={event.imageUrl || group?.bannerUrl}
                alt=""
                className="h-[100px] w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                fallback={
                    <div className="flex h-[100px] items-center justify-center bg-muted">
                        <CalendarDays className="size-6 text-muted-foreground" />
                    </div>
                }
            />
            <div className="absolute top-1 right-1 flex gap-1.5">
                <button type="button" onClick={() => void copy()} className="inline-flex size-7 items-center justify-center rounded-full bg-secondary shadow" aria-label={`Copy event link for ${event.title}`}>
                    {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
                </button>
                <button
                    type="button"
                    onClick={() => void follow()}
                    disabled={busy}
                    className={`inline-flex size-7 items-center justify-center rounded-full shadow disabled:opacity-50 ${following ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                    aria-label={`${following ? "Unfollow" : "Follow"} ${event.title}`}
                >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Star className={`size-3.5 ${following ? "fill-current" : ""}`} />}
                </button>
            </div>
            <div className="px-3 pt-2 pb-3">
                {mode === "timeline" ? (
                    <button type="button" onClick={() => selectGroup(event.ownerId)} className="block text-xs text-muted-foreground hover:underline">
                        {group?.name || event.ownerId}
                    </button>
                ) : null}
                <button type="button" onClick={() => selectGroup(event.ownerId)} className="mt-0.5 block w-full text-left text-sm font-bold leading-tight hover:underline">
                    {event.seriesId ? <Repeat className="mr-1 inline size-4" /> : null}
                    {event.title}
                </button>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium">{mode === "timeline" ? `${timeOnly(event.startsAt)} - ${timeOnly(event.endsAt)}` : eventRange(event)}</span>
                    <span className="capitalize">{event.accessType}</span>
                </div>
                <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="mt-2 text-[11px] text-muted-foreground hover:underline">
                    {expanded ? "Hide details" : "Show details"}
                </button>
                {expanded ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2 text-xs">
                        <button type="button" onClick={() => void download()} disabled={busy} className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input px-2.5 hover:bg-muted">
                            <Download className="size-3.5" /> Download .ics
                        </button>
                        <Info label="Category" value={event.category} />
                        <Info label="Users Interested" value={String(event.interestedUserCount)} />
                        <Info label="Close Instance After End" value={`${event.closeInstanceAfterEndMinutes} min`} />
                        <Info label="Created Date" value={shortDate(event.createdAt)} />
                        <div className="col-span-2">
                            <span className="text-muted-foreground">Description</span>
                            <p className="mt-1 whitespace-pre-wrap break-words">{event.description || "—"}</p>
                        </div>
                    </div>
                ) : null}
                {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
            </div>
        </article>
    );
}

function MonthCalendar({ selected, events, followingIds, changeMonth, select }: { selected: Date; events: VrchatGroupCalendarEvent[]; followingIds: Set<string>; changeMonth: (offset: number) => void; select: (date: Date) => void }) {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
    const byDate = new Map<string, VrchatGroupCalendarEvent[]>();
    for (const event of events) byDate.set(calendarDateKey(event.startsAt), [...(byDate.get(calendarDateKey(event.startsAt)) || []), event]);
    return (
        <div className="min-h-0 overflow-y-auto px-3">
            <div className="flex items-center justify-between">
                <button type="button" onClick={() => changeMonth(-1)} className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Previous month">
                    <ChevronLeft className="size-4" />
                </button>
                <h3 className="text-base font-medium">{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(selected)}</h3>
                <button type="button" onClick={() => changeMonth(1)} className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Next month">
                    <ChevronRight className="size-4" />
                </button>
            </div>
            <div className="mt-4 grid grid-cols-7 text-center text-xs text-muted-foreground">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <span key={day}>{day}</span>
                ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-y-2">
                {days.map((day) => {
                    const key = calendarDateKey(day);
                    const rows = byDate.get(key) || [];
                    const currentMonth = day.getMonth() === selected.getMonth();
                    const isSelected = key === calendarDateKey(selected);
                    const hasFollowing = rows.some((event) => followingIds.has(event.id));
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => select(day)}
                            className={`relative mx-auto flex size-12 items-center justify-center rounded-xl text-lg hover:bg-muted ${isSelected ? "bg-accent ring-1 ring-primary" : ""} ${currentMonth ? "" : "text-muted-foreground/40"}`}
                            aria-label={`${shortDate(day)}${rows.length ? `, ${rows.length} events` : ""}`}
                        >
                            {day.getDate()}
                            {rows.length ? <span className={`absolute top-0 right-0 inline-flex h-4 min-w-4 items-center justify-center rounded-xl px-1 text-[10px] font-bold ${hasFollowing ? "bg-primary text-primary-foreground" : "bg-foreground text-background"}`}>{rows.length}</span> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className="text-muted-foreground">{label}</span>
            <p className="mt-1 font-medium capitalize">{value}</p>
        </div>
    );
}
function Loading() {
    return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading calendar…
        </div>
    );
}
function Empty({ label }: { label: string }) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">{label}</div>;
}
function toggleSet(current: Set<string>, value: string) {
    const next = new Set(current);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
}
function shortDay(value: string) {
    return new Intl.DateTimeFormat("en", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(value));
}
function shortDate(value: string | Date) {
    return new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(new Date(value));
}
function timeOnly(value: string) {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function eventRange(event: VrchatGroupCalendarEvent) {
    return `${shortDate(event.startsAt)} ${timeOnly(event.startsAt)} - ${timeOnly(event.endsAt)}`;
}
function readError(payload: unknown, fallback: string) {
    return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}
