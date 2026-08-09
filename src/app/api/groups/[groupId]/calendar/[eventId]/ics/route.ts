import { NextResponse } from "next/server";

import { calendarDownloadHeaders, validateCalendarIcs } from "@/lib/calendar-ics";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { calendarEventIdSchema, groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

export async function GET(_request: Request, context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]/ics">) {
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const eventId = calendarEventIdSchema.safeParse(params.eventId);
    if (!groupId.success || !eventId.success) return errorResponse("The calendar download request is invalid.", 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<string>(`calendar/${groupId.data}/${eventId.data}.ics`, { cookies, responseType: "text" });
        const content = validateCalendarIcs(upstream.data);
        await persistRotatedVrchatCookies(upstream.cookies, expectedAuthCookie);
        return new NextResponse(content, {
            headers: calendarDownloadHeaders(eventId.data),
        });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return errorResponse(error instanceof VrchatApiError ? error.message : "The calendar file response was not valid.", status);
    }
}

function errorResponse(error: string, status: number) {
    const response = NextResponse.json({ error }, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
