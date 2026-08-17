import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedGroupBans, replaceCachedGroupBans } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupPermission } from "@/lib/vrchat/group-permissions";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupMemberSchema } from "@/lib/vrchat/types";

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/moderation/bans">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success) return response({ error: "The group ID is invalid." }, 400);
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedGroupBans(ownerId, groupId.data);
        if (cached) return response({ bans: cached, cached: true });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPermission(groupId.data, "group-bans-manage", cookies);
        Object.assign(cookies, permission.cookies);
        const bans = [];
        for (let offset = 0, page = 0; page < 50; page += 1, offset += 100) {
            const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/bans`, { cookies, query: { n: 100, offset } });
            Object.assign(cookies, upstream.cookies);
            const rows = z.array(vrchatGroupMemberSchema).parse(upstream.data);
            if (rows.some((row) => row.groupId && row.groupId !== groupId.data)) throw new Error("The group bans response contained another group.");
            bans.push(...rows);
            if (rows.length < 100) break;
        }
        const unique = Array.from(new Map(bans.map((ban) => [ban.userId, ban])).values());
        await replaceCachedGroupBans(ownerId, groupId.data, unique);
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return response({ bans: unique, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group bans response was not valid." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
