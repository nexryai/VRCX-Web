import { type NextRequest, NextResponse } from "next/server";

import { deactivateCachedGroupPost, upsertCachedGroupPost } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupPostPermission, editGroupPostRequestSchema, parseGroupPostForGroup } from "@/lib/vrchat/group-posts";
import { groupIdSchema, groupPostIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

export async function PUT(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/posts/[postId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const postId = groupPostIdSchema.safeParse(params.postId);
    const body = editGroupPostRequestSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !postId.success || !body.success) return response({ error: "The group post is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPostPermission(groupId.data, body.data.roleIds, cookies);
        Object.assign(cookies, permission.cookies);
        const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/posts/${postId.data}`, { method: "PUT", cookies, body: body.data });
        Object.assign(cookies, upstream.cookies);
        const post = parseGroupPostForGroup(upstream.data, groupId.data, postId.data);
        const [projection, session] = await Promise.allSettled([upsertCachedGroupPost(ownerId, groupId.data, post), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ post, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group post response was not valid.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/posts/[postId]">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const params = await context.params;
    const groupId = groupIdSchema.safeParse(params.groupId);
    const postId = groupPostIdSchema.safeParse(params.postId);
    if (!groupId.success || !postId.success) return response({ error: "The group post is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPostPermission(groupId.data, [], cookies);
        Object.assign(cookies, permission.cookies);
        const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/posts/${postId.data}`, { method: "DELETE", cookies });
        Object.assign(cookies, upstream.cookies);
        const [projection, session] = await Promise.allSettled([deactivateCachedGroupPost(ownerId, groupId.data, postId.data), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ success: true, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
    } catch (error) {
        return mutationError(error, expectedAuthCookie, "The group post could not be deleted.");
    }
}

async function mutationError(error: unknown, expectedAuthCookie: string | undefined, fallback: string) {
    const status = error instanceof VrchatApiError ? error.status : 502;
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response({ error: error instanceof VrchatApiError ? error.message : fallback }, status);
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
