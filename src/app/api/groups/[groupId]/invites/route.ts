import { type NextRequest, NextResponse } from "next/server";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupInviteRequestSchema } from "@/lib/vrchat/group-invites";
import { assertGroupPermission } from "@/lib/vrchat/group-permissions";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/invites">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const body = groupInviteRequestSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !body.success) return response({ error: "The group invitation is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPermission(groupId.data, "group-invites-manage", cookies);
        Object.assign(cookies, permission.cookies);
        const succeededUserIds: string[] = [];
        let failed: { userId: string; error: string } | undefined;
        for (const userId of body.data.userIds) {
            try {
                const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/invites`, { method: "POST", cookies, body: { userId } });
                Object.assign(cookies, upstream.cookies);
                succeededUserIds.push(userId);
            } catch (error) {
                failed = { userId, error: error instanceof VrchatApiError ? error.message : "The invitation could not be sent." };
                break;
            }
        }
        // Sending an invite is not idempotent. Once any upstream mutation has
        // succeeded, a local cookie-persistence failure must not invite a retry
        // that could send the same invitation twice.
        const [session] = await Promise.allSettled([persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ succeededUserIds, ...(failed ? { failed } : {}), refreshRequired: session.status === "rejected" }, failed ? 207 : 200);
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group invitations could not be sent." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
