import { z } from "zod";

import { calendarEventIdSchema, groupIdSchema } from "./vrchat/ids";
import type { VrchatGroupCalendarEvent } from "./vrchat/types";
import { vrchatGroupCalendarEventSchema, vrchatGroupSchema } from "./vrchat/types";

export const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const globalCalendarEventSchema = vrchatGroupCalendarEventSchema.refine((event) => groupIdSchema.safeParse(event.ownerId).success && calendarEventIdSchema.safeParse(event.id).success, "The calendar event identifiers are invalid.");

export const toolsGroupCalendarPayloadSchema = z
    .object({
        month: calendarMonthSchema,
        events: z.array(globalCalendarEventSchema).max(5_000),
        followingEvents: z.array(globalCalendarEventSchema).max(5_000),
        featuredEvents: z.array(globalCalendarEventSchema).max(5_000),
        featuredFetched: z.boolean(),
        groups: z.record(groupIdSchema, vrchatGroupSchema),
        observedAt: z.coerce.date(),
        cached: z.boolean().optional(),
    })
    .strict();

export type ToolsGroupCalendarPayload = z.infer<typeof toolsGroupCalendarPayloadSchema>;

export function calendarMonthFromDate(date: Date) {
    const year = date.getFullYear();
    return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function calendarDateKey(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function mergeCalendarEvents(...sets: VrchatGroupCalendarEvent[][]) {
    const byId = new Map<string, VrchatGroupCalendarEvent>();
    for (const events of sets) for (const event of events) byId.set(event.id, { ...byId.get(event.id), ...event });
    return [...byId.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function oneEventPerSeries(events: VrchatGroupCalendarEvent[]) {
    const series = new Set<string>();
    return events.filter((event) => {
        if (!event.seriesId) return true;
        if (series.has(event.seriesId)) return false;
        series.add(event.seriesId);
        return true;
    });
}

export function partitionGroupCalendarEvents(events: VrchatGroupCalendarEvent[], now = Date.now()) {
    const sorted = events.toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
        past: oneEventPerSeries(sorted.filter((event) => Date.parse(event.endsAt) < now)),
        upcoming: oneEventPerSeries(sorted.filter((event) => Date.parse(event.endsAt) >= now)),
    };
}
