import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { updateCachedGroupCalendarEvent } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupCalendarInterestUpdateSchema } from "@/lib/vrchat/types";

const eventIdSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9_-]+$/i);
const followSchema = z.object({ isFollowing: z.boolean() }).strict();

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/calendar/[eventId]/follow">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const eventId = eventIdSchema.safeParse(params.eventId);
    const body = followSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !eventId.success || !body.success) return response({ error: "The calendar follow request is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`calendar/${groupId.data}/${eventId.data}/follow`, { method: "POST", cookies, body: body.data });
        const event = vrchatGroupCalendarInterestUpdateSchema.parse(upstream.data);
        if (event.id !== eventId.data || (event.ownerId && event.ownerId !== groupId.data)) throw new Error("The calendar follow response did not match the requested event.");
        await updateCachedGroupCalendarEvent(ownerId, groupId.data, event);
        await persistRotatedVrchatCookies(upstream.cookies, expectedAuthCookie);
        return response({ event });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The calendar follow request could not be completed." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
