import { type NextRequest, NextResponse } from "next/server";

import { getCachedGroupCalendar, replaceCachedGroupCalendar, upsertCachedGroupCalendarEvent } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { projectToolsGroupCalendarEvent } from "@/lib/mongodb/tools-group-calendar-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupCalendarEventInputSchema, groupCalendarEventUpstreamBody } from "@/lib/vrchat/group-calendar-event";
import { assertGroupCalendarEventPolicy } from "@/lib/vrchat/group-calendar-policy";
import { groupIdSchema } from "@/lib/vrchat/ids";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { type VrchatGroupCalendarEvent, vrchatGroupCalendarEventSchema, vrchatGroupCalendarResponseSchema } from "@/lib/vrchat/types";

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    if (!groupId.success) return response({ error: "The group ID is invalid." }, 400);

    const ownerId = await requireActiveUserId();
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!refresh) {
        const cached = await getCachedGroupCalendar(ownerId, groupId.data);
        if (cached) return response({ ...cached, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const listResponse = await requestVrchat<unknown>(`calendar/${groupId.data}`, { cookies });
        let currentCookies = { ...cookies, ...listResponse.cookies };
        const calendar = vrchatGroupCalendarResponseSchema.parse(listResponse.data);
        if (calendar.results.some((event) => event.ownerId !== groupId.data)) throw new Error("The group calendar response did not match the requested group.");

        const events: VrchatGroupCalendarEvent[] = [];
        for (const event of calendar.results) {
            const detail = await fetchEventDetail(groupId.data, event, currentCookies);
            currentCookies = detail.cookies;
            events.push(detail.event);
        }

        const observedAt = new Date();
        const hasNext = calendar.hasNext ?? false;
        const totalCount = calendar.totalCount ?? events.length;
        await replaceCachedGroupCalendar(ownerId, groupId.data, events, hasNext, totalCount, observedAt);
        await persistRotatedVrchatCookies(currentCookies, expectedAuthCookie);
        return response({ events, hasNext, totalCount, observedAt, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group calendar response was not valid." }, status);
    }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const body = groupCalendarEventInputSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !body.success) return response({ error: "The group event is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const group = await assertGroupCalendarEventPolicy(groupId.data, body.data, ownerId, cookies);
        const upstream = await requestVrchat<unknown>(`calendar/${groupId.data}/event`, { method: "POST", cookies, body: { groupId: groupId.data, ...groupCalendarEventUpstreamBody(body.data) } });
        Object.assign(cookies, upstream.cookies);
        const event = parseEventForGroup(upstream.data, groupId.data);
        // Creation is not idempotent. Preserve upstream success if local
        // projections or rotated-cookie persistence need later reconciliation.
        const [groupProjection, toolsProjection, session] = await Promise.allSettled([upsertCachedGroupCalendarEvent(ownerId, groupId.data, event), projectToolsGroupCalendarEvent(ownerId, event, group), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ event, refreshRequired: [groupProjection, toolsProjection, session].some((result) => result.status === "rejected") });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group event response was not valid.");
    }
}

async function fetchEventDetail(groupId: string, event: VrchatGroupCalendarEvent, cookies: VrchatCookies) {
    try {
        const upstream = await requestVrchat<unknown>(`calendar/${groupId}/${event.id}`, { cookies });
        const detailed = vrchatGroupCalendarEventSchema.parse(upstream.data);
        if (detailed.id !== event.id || detailed.ownerId !== groupId) throw new Error("The calendar event response did not match the requested event.");
        return { event: detailed, cookies: { ...cookies, ...upstream.cookies } };
    } catch (error) {
        if (!(error instanceof VrchatApiError) || error.status === 401) throw error;
        // The list remains useful when the optional interest-enrichment request
        // is unavailable or rate-limited, matching VRCX's base card behavior.
        return { event, cookies };
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}

function parseEventForGroup(value: unknown, groupId: string, eventId?: string) {
    const event = vrchatGroupCalendarEventSchema.parse(value);
    if (event.ownerId !== groupId || (eventId && event.id !== eventId)) throw new Error("The calendar event response did not match the requested event.");
    return event;
}

async function mutationError(error: unknown, expectedAuthCookie: string | undefined, fallback: string) {
    const status = error instanceof VrchatApiError ? error.status : 502;
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response({ error: error instanceof VrchatApiError ? error.message : fallback }, status);
}
