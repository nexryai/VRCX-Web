import { type NextRequest, NextResponse } from "next/server";

import { removeCachedGroupCalendarEvent, upsertCachedGroupCalendarEvent } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { projectToolsGroupCalendarEvent, removeToolsGroupCalendarEvent } from "@/lib/mongodb/tools-group-calendar-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupCalendarEventInputSchema, groupCalendarEventUpstreamBody } from "@/lib/vrchat/group-calendar-event";
import { assertGroupCalendarEventPolicy } from "@/lib/vrchat/group-calendar-policy";
import { calendarEventIdSchema, groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupCalendarEventSchema } from "@/lib/vrchat/types";

export async function GET(_request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]">) {
    const params = await validParams(context);
    if (!params) return response({ error: "The group event is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`calendar/${params.groupId}/${params.eventId}`, { cookies });
        Object.assign(cookies, upstream.cookies);
        const event = parseEvent(upstream.data, params.groupId, params.eventId);
        const [projection, session] = await Promise.allSettled([upsertCachedGroupCalendarEvent(ownerId, params.groupId, event), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ event, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group event response was not valid.");
    }
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await validParams(context);
    const body = groupCalendarEventInputSchema.safeParse(await request.json().catch(() => null));
    if (!params || !body.success) return response({ error: "The group event is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const group = await assertGroupCalendarEventPolicy(params.groupId, body.data, ownerId, cookies);
        const upstream = await requestVrchat<unknown>(`calendar/${params.groupId}/${params.eventId}/event`, { method: "PUT", cookies, body: { groupId: params.groupId, ...groupCalendarEventUpstreamBody(body.data) } });
        Object.assign(cookies, upstream.cookies);
        const event = parseEvent(upstream.data, params.groupId, params.eventId);
        const [groupProjection, toolsProjection, session] = await Promise.allSettled([upsertCachedGroupCalendarEvent(ownerId, params.groupId, event), projectToolsGroupCalendarEvent(ownerId, event, group), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ event, refreshRequired: [groupProjection, toolsProjection, session].some((result) => result.status === "rejected") });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group event response was not valid.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await validParams(context);
    if (!params) return response({ error: "The group event is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        await assertGroupCalendarEventPolicy(params.groupId, null, ownerId, cookies);
        const upstream = await requestVrchat<unknown>(`calendar/${params.groupId}/${params.eventId}`, { method: "DELETE", cookies });
        Object.assign(cookies, upstream.cookies);
        const [groupProjection, toolsProjection, session] = await Promise.allSettled([removeCachedGroupCalendarEvent(ownerId, params.groupId, params.eventId), removeToolsGroupCalendarEvent(ownerId, params.eventId), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ success: true, refreshRequired: [groupProjection, toolsProjection, session].some((result) => result.status === "rejected") });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group event could not be deleted.");
    }
}

async function validParams(context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]">) {
    const raw = await context.params;
    const groupId = groupIdSchema.safeParse(raw.groupId);
    const eventId = calendarEventIdSchema.safeParse(raw.eventId);
    return groupId.success && eventId.success ? { groupId: groupId.data, eventId: eventId.data } : null;
}

function parseEvent(value: unknown, groupId: string, eventId: string) {
    const event = vrchatGroupCalendarEventSchema.parse(value);
    if (event.ownerId !== groupId || event.id !== eventId) throw new Error("The calendar event response did not match the requested event.");
    return event;
}

async function mutationError(error: unknown, expectedAuthCookie: string | undefined, fallback: string) {
    const status = error instanceof VrchatApiError ? error.status : 502;
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response({ error: error instanceof VrchatApiError ? error.message : fallback }, status);
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
