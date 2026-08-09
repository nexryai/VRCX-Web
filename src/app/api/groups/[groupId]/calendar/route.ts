import { type NextRequest, NextResponse } from "next/server";

import { getCachedGroupCalendar, replaceCachedGroupCalendar } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
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
