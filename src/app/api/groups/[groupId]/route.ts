import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedGroup, upsertCachedGroups } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupSchema } from "@/lib/vrchat/types";

const groupIdSchema = z.string().regex(/^grp_[0-9a-f-]{36}$/i);

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success) return NextResponse.json({ error: "The group ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedGroup(ownerId, groupId.data);
        if (cached) return groupResponse({ group: cached });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`groups/${groupId.data}`, { cookies, query: { includeRoles: true } });
        const group = vrchatGroupSchema.parse(upstream.data);
        await upsertCachedGroups(ownerId, [group], "lookup");
        const response = groupResponse({ group });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return response;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The group could not be loaded." }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

function groupResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
