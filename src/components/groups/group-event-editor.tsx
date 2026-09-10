"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarDays, ImageIcon, Loader2, Trash2, X } from "lucide-react";

import { GalleryFilePicker } from "@/components/groups/gallery-file-picker";
import { VrchatImage } from "@/components/vrchat-image";
import { type GroupCalendarEventInput, groupCalendarCategories, groupCalendarEventInputSchema, groupCalendarPlatforms, groupCalendarWeekdays } from "@/lib/vrchat/group-calendar-event";
import type { VrchatGroup, VrchatGroupCalendarEvent } from "@/lib/vrchat/types";

const categoryLabels: Record<(typeof groupCalendarCategories)[number], string> = {
    arts: "Arts",
    avatars: "Avatars",
    dance: "Dance",
    education: "Education",
    exploration: "Exploration",
    film_media: "Film & Media",
    gaming: "Gaming",
    hangout: "Hangout",
    music: "Music",
    other: "Other",
    performance: "Performance",
    roleplaying: "Roleplaying",
    wellness: "Wellness",
};
const weekdayLabels = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" } as const;
const languages = [
    ["eng", "English"],
    ["jpn", "Japanese"],
    ["deu", "German"],
    ["fra", "French"],
    ["kor", "Korean"],
    ["spa", "Spanish"],
    ["por", "Portuguese"],
    ["rus", "Russian"],
    ["zho", "Chinese"],
    ["ita", "Italian"],
    ["nld", "Dutch"],
    ["pol", "Polish"],
] as const;

type EditorState = {
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    accessType: "group" | "public";
    category: (typeof groupCalendarCategories)[number];
    tags: string;
    imageId: string | null;
    imageUrl: string;
    roleIds: string[];
    platforms: (typeof groupCalendarPlatforms)[number][];
    languages: string[];
    sendCreationNotification: boolean;
    hostEarlyJoinMinutes: number;
    guestEarlyJoinMinutes: number;
    closeInstanceAfterEndMinutes: number;
    frequency: "never" | "weekly" | "monthly" | "yearly";
    interval: number;
    daysOfWeek: (typeof groupCalendarWeekdays)[number][];
    recurrenceEnd: "never" | "count" | "date";
    recurrenceCount: number;
    recurrenceDate: string;
};

export function GroupEventEditor({ groupId, initialGroup, event, vrcPlus, close, saved }: { groupId: string; initialGroup?: VrchatGroup; event: VrchatGroupCalendarEvent | null; vrcPlus: boolean; close: () => void; saved: (event: VrchatGroupCalendarEvent | null) => void }) {
    const [group, setGroup] = useState(initialGroup);
    const [editing, setEditing] = useState(event);
    const [state, setState] = useState(() => editorState(event));
    const [busy, setBusy] = useState(false);
    const [loadingGroup, setLoadingGroup] = useState(!initialGroup);
    const [error, setError] = useState("");
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const dialog = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoadingGroup(true);
        void fetch(`/api/groups/${encodeURIComponent(groupId)}?refresh=true`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => ({ response, payload: (await response.json()) as { error?: string; group?: VrchatGroup } }))
            .then(({ response, payload }) => {
                if (response.status === 401) window.location.assign("/login");
                if (!response.ok || !payload.group) throw new Error(payload.error || "The group could not be loaded.");
                setGroup(payload.group);
            })
            .catch((loadError) => {
                if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "The group could not be loaded.");
            })
            .finally(() => setLoadingGroup(false));
        return () => controller.abort();
    }, [groupId]);

    useEffect(() => {
        closeButton.current?.focus();
        function keydown(keyEvent: KeyboardEvent) {
            if (keyEvent.key === "Escape" && !galleryOpen && !confirmDelete) {
                keyEvent.preventDefault();
                close();
                return;
            }
            if (keyEvent.key !== "Tab" || !dialog.current || galleryOpen || confirmDelete) return;
            const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])"));
            const first = focusable[0];
            const last = focusable.at(-1);
            if (keyEvent.shiftKey && document.activeElement === first) {
                keyEvent.preventDefault();
                last?.focus();
            } else if (!keyEvent.shiftKey && document.activeElement === last) {
                keyEvent.preventDefault();
                first?.focus();
            }
        }
        window.addEventListener("keydown", keydown, true);
        return () => window.removeEventListener("keydown", keydown, true);
    }, [close, confirmDelete, galleryOpen]);

    const tagList = useMemo(
        () =>
            state.tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
        [state.tags],
    );
    function patch<K extends keyof EditorState>(key: K, value: EditorState[K]) {
        setState((current) => ({ ...current, [key]: value }));
    }

    function buildInput(): GroupCalendarEventInput {
        if (state.frequency !== "never" && state.recurrenceEnd === "date" && Date.parse(state.recurrenceDate) <= Date.parse(state.startsAt)) throw new Error("The recurrence end date must follow the event start.");
        const recurrence =
            state.frequency === "never"
                ? {}
                : {
                      occurrenceKind: "series" as const,
                      recurrence: {
                          frequency: state.frequency,
                          interval: state.interval,
                          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                          ...(state.frequency === "weekly" && state.daysOfWeek.length ? { daysOfWeek: state.daysOfWeek } : {}),
                          ...(state.recurrenceEnd === "count" ? { end: { type: "afterOccurrences" as const, count: state.recurrenceCount } } : state.recurrenceEnd === "date" ? { end: { type: "afterDate" as const, date: state.recurrenceDate } } : { end: null }),
                      },
                  };
        return groupCalendarEventInputSchema.parse({
            startsAt: new Date(state.startsAt).toISOString(),
            endsAt: new Date(state.endsAt).toISOString(),
            title: state.title,
            accessType: state.accessType,
            description: state.description,
            category: state.category,
            tags: tagList,
            imageId: state.imageId,
            roleIds: state.roleIds,
            platforms: state.platforms,
            languages: state.languages,
            sendCreationNotification: state.sendCreationNotification,
            hostEarlyJoinMinutes: state.hostEarlyJoinMinutes,
            guestEarlyJoinMinutes: state.guestEarlyJoinMinutes,
            closeInstanceAfterEndMinutes: state.closeInstanceAfterEndMinutes,
            ...(!editing?.seriesId ? recurrence : {}),
        });
    }

    async function submit() {
        setError("");
        let input: GroupCalendarEventInput;
        try {
            input = buildInput();
        } catch {
            setError("Check the required fields, date range, tags, and recurrence settings.");
            return;
        }
        setBusy(true);
        try {
            const endpoint = editing ? `/api/groups/${encodeURIComponent(groupId)}/calendar/${encodeURIComponent(editing.id)}` : `/api/groups/${encodeURIComponent(groupId)}/calendar`;
            const response = await fetch(endpoint, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
            const payload = (await response.json()) as { error?: string; event?: VrchatGroupCalendarEvent };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.event) throw new Error(payload.error || "The group event could not be saved.");
            saved(payload.event);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "The group event could not be saved.");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!editing) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/calendar/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
            const payload = (await response.json()) as { error?: string };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok) throw new Error(payload.error || "The group event could not be deleted.");
            saved(null);
        } catch (deleteError) {
            setConfirmDelete(false);
            setError(deleteError instanceof Error ? deleteError.message : "The group event could not be deleted.");
        } finally {
            setBusy(false);
        }
    }

    async function editParent() {
        if (!editing?.seriesId) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/calendar/${encodeURIComponent(editing.seriesId)}`, { cache: "no-store" });
            const payload = (await response.json()) as { error?: string; event?: VrchatGroupCalendarEvent };
            if (!response.ok || !payload.event) throw new Error(payload.error || "The parent event could not be loaded.");
            setEditing(payload.event);
            setState(editorState(payload.event));
        } catch (parentError) {
            setError(parentError instanceof Error ? parentError.message : "The parent event could not be loaded.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-2 sm:p-4">
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="group-event-editor-title" className="flex max-h-[85dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
                <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
                    <CalendarDays className="mr-2 size-4 text-primary" />
                    <h3 id="group-event-editor-title" className="font-semibold">
                        {editing ? "Edit Group Event" : "Create Group Event"}
                    </h3>
                    <button ref={closeButton} type="button" onClick={close} className="ml-auto inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close event editor">
                        <X className="size-4" />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
                    {error ? <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">{error}</p> : null}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Title" span>
                            <input aria-label="Title" required maxLength={64} value={state.title} onChange={(e) => patch("title", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </Field>
                        <Field label="Description" span>
                            <textarea aria-label="Description" required maxLength={1024} rows={4} value={state.description} onChange={(e) => patch("description", e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </Field>
                        <Field label="Starts">
                            <input aria-label="Starts" type="datetime-local" required value={state.startsAt} onChange={(e) => patch("startsAt", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </Field>
                        <Field label="Ends">
                            <input aria-label="Ends" type="datetime-local" required min={state.startsAt} value={state.endsAt} onChange={(e) => patch("endsAt", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </Field>
                        {!editing?.seriesId ? <RecurrenceFields state={state} patch={patch} cannotRemove={Boolean(editing?.recurrence && typeof editing.recurrence === "object")} /> : null}
                        <Field label="Access">
                            <select aria-label="Access" value={state.accessType} onChange={(e) => patch("accessType", e.target.value as EditorState["accessType"])} className="h-9 w-full rounded-md border border-input bg-background px-3">
                                <option value="group">Group</option>
                                <option value="public" disabled={group?.privacy !== "default"}>
                                    Public
                                </option>
                            </select>
                        </Field>
                        <Field label="Category">
                            <select aria-label="Category" value={state.category} onChange={(e) => patch("category", e.target.value as EditorState["category"])} className="h-9 w-full rounded-md border border-input bg-background px-3">
                                {groupCalendarCategories.map((category) => (
                                    <option key={category} value={category}>
                                        {categoryLabels[category]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Tags (comma-separated, max 5)" span>
                            <input aria-label="Tags" value={state.tags} onChange={(e) => patch("tags", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                            <span className="mt-1 text-muted-foreground">{tagList.length}/5</span>
                        </Field>
                        <MultiChecks label="Platforms" values={groupCalendarPlatforms.map((value) => [value, value === "standalonewindows" ? "PC" : value === "android" ? "Android" : "iOS"] as const)} selected={state.platforms} toggle={(value) => patch("platforms", toggle(state.platforms, value))} />
                        <MultiChecks label="Languages (max 3)" values={languages} selected={state.languages} toggle={(value) => patch("languages", state.languages.includes(value) ? state.languages.filter((item) => item !== value) : state.languages.length < 3 ? [...state.languages, value] : state.languages)} />
                        {group?.roles?.length ? (
                            <Field label="Roles" span>
                                <div className="flex flex-wrap gap-2 rounded-md border border-input p-2">
                                    {group.roles.map((role) => (
                                        <label key={role.id} className="inline-flex items-center gap-1.5">
                                            <input type="checkbox" checked={state.roleIds.includes(role.id)} onChange={() => patch("roleIds", toggle(state.roleIds, role.id))} /> {role.name}
                                        </label>
                                    ))}
                                </div>
                            </Field>
                        ) : null}
                        <Field label="Image" span>
                            <div className="flex items-start gap-3">
                                {state.imageUrl ? (
                                    <VrchatImage src={state.imageUrl} alt="" className="h-20 w-32 rounded-md object-cover" />
                                ) : (
                                    <div className="flex h-20 w-32 items-center justify-center rounded-md bg-muted">
                                        <ImageIcon className="size-5 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setGalleryOpen(true)} className="h-9 rounded-md border border-input px-3 hover:bg-muted">
                                        Select Image
                                    </button>
                                    {state.imageId ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                patch("imageId", null);
                                                patch("imageUrl", "");
                                            }}
                                            className="h-9 rounded-md border border-input px-3 hover:bg-muted"
                                        >
                                            Clear
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </Field>
                        <MinuteField label="Host early join (minutes)" value={state.hostEarlyJoinMinutes} disabled={Boolean(editing)} set={(value) => patch("hostEarlyJoinMinutes", value)} />
                        <MinuteField label="Guest early join (minutes)" value={state.guestEarlyJoinMinutes} disabled={Boolean(editing)} set={(value) => patch("guestEarlyJoinMinutes", value)} />
                        <MinuteField label="Close instance after end (minutes)" value={state.closeInstanceAfterEndMinutes} disabled={Boolean(editing)} set={(value) => patch("closeInstanceAfterEndMinutes", value)} />
                        {!editing ? (
                            <Field label="Notification">
                                <label className="flex h-9 items-center gap-2">
                                    <input type="checkbox" checked={state.sendCreationNotification} onChange={(e) => patch("sendCreationNotification", e.target.checked)} /> Send creation notification
                                </label>
                            </Field>
                        ) : null}
                    </div>
                </div>
                <footer className="grid shrink-0 grid-cols-2 items-center gap-2 border-t border-border px-4 py-3 sm:flex">
                    {editing ? (
                        <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-destructive px-3 text-destructive hover:bg-destructive/10 disabled:opacity-40">
                            <Trash2 className="size-3.5" /> Delete
                        </button>
                    ) : null}
                    {editing?.seriesId ? (
                        <button type="button" disabled={busy} onClick={() => void editParent()} className="h-9 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                            Edit Parent
                        </button>
                    ) : null}
                    <button type="button" onClick={close} disabled={busy} className="h-9 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40 sm:ml-auto">
                        Cancel
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={busy || loadingGroup || !group} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-40">
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Save
                    </button>
                </footer>
            </div>
            {galleryOpen ? (
                <GalleryFilePicker
                    vrcPlus={vrcPlus}
                    close={() => setGalleryOpen(false)}
                    select={(file, url) => {
                        patch("imageId", file.id);
                        patch("imageUrl", url);
                        setGalleryOpen(false);
                    }}
                />
            ) : null}
            {confirmDelete ? (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4">
                    <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-lg border border-border bg-popover p-4 shadow-2xl">
                        <h4 className="font-semibold">Delete Group Event</h4>
                        <p className="mt-3 text-sm">Are you sure you want to delete this group event?</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="h-9 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                                Cancel
                            </button>
                            <button type="button" disabled={busy} onClick={() => void remove()} className="h-9 rounded-md bg-destructive px-4 text-destructive-foreground disabled:opacity-40">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Field({ label, span = false, children }: { label: string; span?: boolean; children: React.ReactNode }) {
    return (
        <div className={`block ${span ? "sm:col-span-2" : ""}`}>
            <span className="mb-1 block font-medium">{label}</span>
            {children}
        </div>
    );
}
function MinuteField({ label, value, disabled, set }: { label: string; value: number; disabled: boolean; set: (value: number) => void }) {
    return (
        <Field label={label}>
            <input aria-label={label} type="number" min={0} max={60} value={value} disabled={disabled} onChange={(event) => set(Number(event.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-3 disabled:opacity-50" />
        </Field>
    );
}
function MultiChecks<T extends string>({ label, values, selected, toggle: onToggle }: { label: string; values: readonly (readonly [T, string])[]; selected: readonly string[]; toggle: (value: T) => void }) {
    return (
        <Field label={label}>
            <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-input px-2">
                {values.map(([value, text]) => (
                    <label key={value} className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /> {text}
                    </label>
                ))}
            </div>
        </Field>
    );
}
function RecurrenceFields({ state, patch, cannotRemove }: { state: EditorState; patch: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void; cannotRemove: boolean }) {
    const control = "h-9 w-full rounded-md border border-input bg-background px-3";
    return (
        <>
            <Field label="Repeats">
                <select aria-label="Repeats" value={state.frequency} onChange={(e) => patch("frequency", e.target.value as EditorState["frequency"])} className={control}>
                    <option value="never" disabled={cannotRemove}>
                        Never
                    </option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                </select>
            </Field>
            {state.frequency !== "never" ? (
                <>
                    <Field label="Repeat every">
                        <div className="flex items-center gap-2">
                            <input aria-label="Repeat every" type="number" min={1} max={100} value={state.interval} onChange={(e) => patch("interval", Number(e.target.value))} className={control} />
                            <span>{state.frequency === "weekly" ? "week(s)" : state.frequency === "monthly" ? "month(s)" : "year(s)"}</span>
                        </div>
                    </Field>
                    {state.frequency === "weekly" ? (
                        <Field label="Weekly pattern">
                            <select aria-label="Weekly pattern" value={weeklyPattern(state.daysOfWeek)} onChange={(event) => patch("daysOfWeek", weeklyDays(event.target.value))} className={control}>
                                <option value="everyWeek">Every Week</option>
                                <option value="weekdays">Weekdays</option>
                                <option value="weekend">Weekend</option>
                                <option value="custom">Custom</option>
                            </select>
                        </Field>
                    ) : null}
                    {state.frequency === "weekly" && weeklyPattern(state.daysOfWeek) === "custom" ? (
                        <Field label="Custom days">
                            <div className="flex flex-wrap gap-2">
                                {groupCalendarWeekdays.map((day) => (
                                    <label key={day} className="inline-flex items-center gap-1">
                                        <input type="checkbox" checked={state.daysOfWeek.includes(day)} onChange={() => patch("daysOfWeek", toggle(state.daysOfWeek, day))} /> {weekdayLabels[day]}
                                    </label>
                                ))}
                            </div>
                        </Field>
                    ) : null}
                    <Field label="Ends">
                        <select aria-label="Recurrence ends" value={state.recurrenceEnd} onChange={(e) => patch("recurrenceEnd", e.target.value as EditorState["recurrenceEnd"])} className={control}>
                            <option value="never">Never</option>
                            <option value="count">After occurrences</option>
                            <option value="date">After date</option>
                        </select>
                    </Field>
                    {state.recurrenceEnd === "count" ? (
                        <Field label="Occurrences">
                            <input aria-label="Occurrences" type="number" min={1} value={state.recurrenceCount} onChange={(e) => patch("recurrenceCount", Number(e.target.value))} className={control} />
                        </Field>
                    ) : state.recurrenceEnd === "date" ? (
                        <Field label="End date">
                            <input aria-label="End date" type="datetime-local" value={state.recurrenceDate} onChange={(e) => patch("recurrenceDate", e.target.value)} className={control} />
                        </Field>
                    ) : null}
                </>
            ) : null}
        </>
    );
}

function editorState(event: VrchatGroupCalendarEvent | null): EditorState {
    const start = event ? new Date(event.startsAt) : nextRoundedHour();
    const end = event ? new Date(event.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1_000);
    const recurrence = event?.recurrence && typeof event.recurrence === "object" ? event.recurrence : null;
    return {
        title: event?.title || "",
        description: event?.description || "",
        startsAt: localDateTime(start),
        endsAt: localDateTime(end),
        accessType: event?.accessType === "public" ? "public" : "group",
        category: groupCalendarCategories.includes(event?.category as never) ? (event?.category as EditorState["category"]) : "other",
        tags: event?.tags.join(", ") || "",
        imageId: event?.imageId || null,
        imageUrl: event?.imageUrl || "",
        roleIds: event?.roleIds || [],
        platforms: event?.platforms.filter((value): value is EditorState["platforms"][number] => groupCalendarPlatforms.includes(value as never)) || [],
        languages: event?.languages || [],
        sendCreationNotification: false,
        hostEarlyJoinMinutes: event?.hostEarlyJoinMinutes ?? 60,
        guestEarlyJoinMinutes: event?.guestEarlyJoinMinutes ?? 5,
        closeInstanceAfterEndMinutes: event?.closeInstanceAfterEndMinutes ?? 5,
        frequency: recurrence?.frequency || "never",
        interval: recurrence?.interval || 1,
        daysOfWeek: recurrence?.daysOfWeek || [],
        recurrenceEnd: recurrence?.end?.type === "afterOccurrences" ? "count" : recurrence?.end?.type === "afterDate" ? "date" : "never",
        recurrenceCount: recurrence?.end?.type === "afterOccurrences" ? recurrence.end.count : 1,
        recurrenceDate: recurrence?.end?.type === "afterDate" ? localDateTime(new Date(recurrence.end.date)) : localDateTime(end),
    };
}
function nextRoundedHour() {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    return date;
}
function localDateTime(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}
function toggle<T>(values: readonly T[], value: T): T[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
function weeklyPattern(days: readonly string[]) {
    if (!days.length) return "everyWeek";
    if (["MO", "TU", "WE", "TH", "FR"].every((day) => days.includes(day)) && days.length === 5) return "weekdays";
    if (["SA", "SU"].every((day) => days.includes(day)) && days.length === 2) return "weekend";
    return "custom";
}
function weeklyDays(pattern: string): EditorState["daysOfWeek"] {
    if (pattern === "weekdays") return ["MO", "TU", "WE", "TH", "FR"];
    if (pattern === "weekend") return ["SA", "SU"];
    if (pattern === "custom") return ["SA"];
    return [];
}
