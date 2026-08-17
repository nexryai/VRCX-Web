import { type NextRequest, NextResponse } from "next/server";

import { deactivateCachedGroupMember, upsertCachedGroupMembers } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupMemberModerationPermission, groupMemberModerationMutation, groupMemberModerationRequestSchema, groupMemberMutationRemovesMembership } from "@/lib/vrchat/group-moderation";
import { groupIdSchema, userIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupMemberSchema } from "@/lib/vrchat/types";

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/moderation/members/[userId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const userId = userIdSchema.safeParse(params.userId);
    const action = groupMemberModerationRequestSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !userId.success || !action.success) return response({ error: "The group member moderation action is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        if (ownerId === userId.data && action.data.action !== "set-note") return response({ error: "The active operator cannot perform this action on themselves." }, 400);

        const permission = await assertGroupMemberModerationPermission(groupId.data, action.data, cookies);
        Object.assign(cookies, permission.cookies);
        const mutation = groupMemberModerationMutation(groupId.data, userId.data, action.data);
        const upstream = await requestVrchat<unknown>(mutation.endpoint, { method: mutation.method, cookies, ...(mutation.body ? { body: mutation.body } : {}) });
        Object.assign(cookies, upstream.cookies);

        let refreshRequired = false;
        if (groupMemberMutationRemovesMembership(action.data)) {
            const projection = await Promise.allSettled([deactivateCachedGroupMember(ownerId, groupId.data, userId.data)]);
            refreshRequired = projection[0].status === "rejected";
        } else if (action.data.action !== "unban") {
            try {
                const refreshed = await requestVrchat<unknown>(`groups/${groupId.data}/members/${userId.data}`, { cookies });
                Object.assign(cookies, refreshed.cookies);
                const member = vrchatGroupMemberSchema.parse(refreshed.data);
                if (member.userId !== userId.data || (member.groupId && member.groupId !== groupId.data)) throw new Error("The refreshed group member did not match the request.");
                await upsertCachedGroupMembers(ownerId, groupId.data, [member]);
            } catch {
                refreshRequired = true;
            }
        }
        const [session] = await Promise.allSettled([persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ success: true, refreshRequired: refreshRequired || session.status === "rejected" });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group member moderation action could not be completed." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
