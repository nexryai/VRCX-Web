import { type NextRequest, NextResponse } from "next/server";

import { calendarMonthSchema, mergeCalendarEvents, toolsGroupCalendarPayloadSchema } from "@/lib/group-calendar";
import { getCachedGroups, upsertCachedGroups } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { getToolsGroupCalendar, replaceToolsGroupCalendar } from "@/lib/mongodb/tools-group-calendar-repository";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { calendarEventIdSchema, groupIdSchema } from "@/lib/vrchat/ids";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { type VrchatGroup, type VrchatGroupCalendarEvent, vrchatGroupCalendarResponseSchema, vrchatGroupSchema } from "@/lib/vrchat/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export async function GET(request: NextRequest) {
    const month = calendarMonthSchema.safeParse(request.nextUrl.searchParams.get("month"));
    if (!month.success) return response({ error: "The calendar month is invalid." }, 400);
    const includeFeatured = request.nextUrl.searchParams.get("featured") === "true";
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const ownerId = await requireActiveUserId();
    const cached = await getToolsGroupCalendar(ownerId, month.data);
    if (!refresh && cached && (!includeFeatured || cached.featuredFetched)) return response({ ...cached, cached: true });

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const date = `${month.data}-01T00:00:00Z`;
        const calendar = await fetchCalendarPages("calendar", date, cookies);
        const following = await fetchCalendarPages("calendar/following", date, calendar.cookies);
        const featured = includeFeatured ? await fetchCalendarPages("calendar/featured", date, following.cookies) : { events: [] as VrchatGroupCalendarEvent[], cookies: following.cookies };
        const events = validateEvents(mergeCalendarEvents(calendar.events));
        const followingEvents = validateEvents(mergeCalendarEvents(following.events));
        const featuredEvents = validateEvents(mergeCalendarEvents(featured.events));
        const groupIds = [...new Set([...events, ...followingEvents, ...featuredEvents].map((event) => event.ownerId))];
        const groups = await resolveGroups(ownerId, groupIds, featured.cookies);
        const observedAt = new Date();
        const payload = toolsGroupCalendarPayloadSchema.omit({ cached: true }).parse({
            month: month.data,
            events,
            followingEvents,
            featuredEvents,
            featuredFetched: includeFeatured,
            groups: Object.fromEntries(groups.values.map((group) => [group.id, group])),
            observedAt,
        });
        await replaceToolsGroupCalendar(ownerId, payload);
        await persistRotatedVrchatCookies(groups.cookies, expectedAuthCookie);
        return response({ ...payload, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group calendar response was not valid." }, status);
    }
}

async function fetchCalendarPages(endpoint: "calendar" | "calendar/featured" | "calendar/following", date: string, initialCookies: VrchatCookies) {
    const events: VrchatGroupCalendarEvent[] = [];
    let cookies = initialCookies;
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const upstream = await requestVrchat<unknown>(endpoint, { cookies, query: { date, n: PAGE_SIZE, offset: page * PAGE_SIZE } });
        cookies = { ...cookies, ...upstream.cookies };
        const result = vrchatGroupCalendarResponseSchema.parse(upstream.data);
        events.push(...result.results);
        if (result.hasNext === false || result.results.length < PAGE_SIZE) return { events, cookies };
    }
    throw new Error("The group calendar exceeded the supported page limit.");
}

function validateEvents(events: VrchatGroupCalendarEvent[]) {
    for (const event of events) {
        if (!groupIdSchema.safeParse(event.ownerId).success || !calendarEventIdSchema.safeParse(event.id).success) throw new Error("The group calendar contained an invalid event identifier.");
    }
    return events;
}

async function resolveGroups(ownerId: string, groupIds: string[], initialCookies: VrchatCookies) {
    const cachedGroups = await getCachedGroups(ownerId, groupIds);
    const byId = new Map(cachedGroups.map((group) => [group.id, group]));
    let cookies = initialCookies;
    const loaded: VrchatGroup[] = [];
    for (const groupId of groupIds) {
        if (byId.has(groupId)) continue;
        try {
            const upstream = await requestVrchat<unknown>(`groups/${groupId}`, { cookies });
            cookies = { ...cookies, ...upstream.cookies };
            const group = vrchatGroupSchema.parse(upstream.data);
            if (group.id !== groupId) throw new Error("The calendar group response did not match the requested group.");
            byId.set(group.id, group);
            loaded.push(group);
        } catch (error) {
            if (error instanceof VrchatApiError && error.status !== 401) continue;
            throw error;
        }
    }
    await upsertCachedGroups(ownerId, loaded, "lookup");
    return { values: [...byId.values()], cookies };
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
