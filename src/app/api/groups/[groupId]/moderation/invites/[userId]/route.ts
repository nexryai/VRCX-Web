import { type NextRequest, NextResponse } from "next/server";

import { projectGroupInviteAction, upsertCachedGroupMembers } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupInviteModerationActionSchema, groupInviteModerationMutation } from "@/lib/vrchat/group-invite-moderation";
import { assertGroupPermission } from "@/lib/vrchat/group-permissions";
import { groupIdSchema, userIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupMemberSchema } from "@/lib/vrchat/types";

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/moderation/invites/[userId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const userId = userIdSchema.safeParse(params.userId);
    const body = groupInviteModerationActionSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !userId.success || !body.success) return response({ error: "The group invitation moderation action is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPermission(groupId.data, "group-invites-manage", cookies);
        Object.assign(cookies, permission.cookies);
        const mutation = groupInviteModerationMutation(groupId.data, userId.data, body.data.action);
        const upstream = await requestVrchat<unknown>(mutation.endpoint, { method: mutation.method, cookies, ...("query" in mutation ? { query: mutation.query } : {}) });
        Object.assign(cookies, upstream.cookies);
        const projections: Array<Promise<unknown>> = [projectGroupInviteAction(ownerId, groupId.data, userId.data, body.data.action)];
        let refreshRequired = false;
        if (body.data.action === "accept") {
            const member = vrchatGroupMemberSchema.safeParse(upstream.data);
            if (member.success && member.data.userId === userId.data && (!member.data.groupId || member.data.groupId === groupId.data)) projections.push(upsertCachedGroupMembers(ownerId, groupId.data, [member.data]));
            else refreshRequired = true;
        }
        const results = await Promise.allSettled([...projections, persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ success: true, refreshRequired: refreshRequired || results.some((result) => result.status === "rejected" || result.value === false) });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group invitation moderation action could not be completed." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
