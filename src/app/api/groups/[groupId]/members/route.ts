import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { listCachedGroupMembers, upsertCachedGroupMembers } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupMemberSchema } from "@/lib/vrchat/types";

const groupIdSchema = z.string().regex(/^grp_[0-9a-f-]{36}$/i);
const offsetSchema = z.coerce.number().int().min(0).max(5_000).default(0);
const pageSize = 100;

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/members">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const offset = offsetSchema.safeParse(request.nextUrl.searchParams.get("offset") || 0);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success || !offset.success) return NextResponse.json({ error: "The group member request is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await listCachedGroupMembers(ownerId, groupId.data, offset.data, pageSize);
        if (cached.members.length) return response({ ...cached, hasMore: cached.members.length === pageSize || offset.data + cached.members.length < cached.total, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/members`, { cookies, query: { n: pageSize, offset: offset.data } });
        const members = z.array(vrchatGroupMemberSchema).parse(upstream.data);
        await upsertCachedGroupMembers(ownerId, groupId.data, members);
        const result = response({ members, total: offset.data + members.length, hasMore: members.length === pageSize, cached: false });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return result;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The group members response was not valid." }, { status });
    }
}

function response(payload: object) {
    const result = NextResponse.json(payload);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
