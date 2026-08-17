import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedGroupInvites, replaceCachedGroupInvites } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupPermission } from "@/lib/vrchat/group-permissions";
import { groupIdSchema } from "@/lib/vrchat/ids";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { type VrchatGroupMember, vrchatGroupMemberSchema } from "@/lib/vrchat/types";

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/moderation/invites">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success) return response({ error: "The group ID is invalid." }, 400);
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedGroupInvites(ownerId, groupId.data);
        if (cached) return response({ ...cached, cached: true });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPermission(groupId.data, "group-invites-manage", cookies);
        Object.assign(cookies, permission.cookies);
        const invites = await loadRows(groupId.data, "invites", cookies);
        const joinRequests = await loadRows(groupId.data, "requests", cookies, false);
        const blockedRequests = await loadRows(groupId.data, "requests", cookies, true);
        const snapshot = { invites, joinRequests, blockedRequests };
        await replaceCachedGroupInvites(ownerId, groupId.data, snapshot);
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return response({ ...snapshot, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group invitations response was not valid." }, status);
    }
}

async function loadRows(groupId: string, kind: "invites" | "requests", cookies: VrchatCookies, blocked?: boolean) {
    const rows: VrchatGroupMember[] = [];
    for (let offset = 0, page = 0; page < 50; page += 1, offset += 100) {
        const upstream = await requestVrchat<unknown>(`groups/${groupId}/${kind}`, { cookies, query: { n: 100, offset, ...(kind === "requests" ? { blocked: Boolean(blocked) } : {}) } });
        Object.assign(cookies, upstream.cookies);
        const pageRows = z.array(vrchatGroupMemberSchema).parse(upstream.data);
        if (pageRows.some((row) => row.groupId && row.groupId !== groupId)) throw new Error("The group invitation response contained another group.");
        rows.push(...pageRows);
        if (pageRows.length < 100) break;
    }
    return Array.from(new Map(rows.map((row) => [row.userId, row])).values());
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
