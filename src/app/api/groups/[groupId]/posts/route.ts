import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedGroupPosts, replaceCachedGroupPosts, upsertCachedGroupPost } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupPostPermission, createGroupPostRequestSchema, parseGroupPostForGroup } from "@/lib/vrchat/group-posts";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupPostSchema } from "@/lib/vrchat/types";

const postsResponseSchema = z.object({ posts: z.array(vrchatGroupPostSchema).default([]), total: z.number().optional() }).passthrough();

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/posts">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success) return NextResponse.json({ error: "The group ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedGroupPosts(ownerId, groupId.data);
        if (cached) return response({ posts: cached, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const posts = [];
        const pageSize = 100;
        let offset = 0;
        let total = Number.POSITIVE_INFINITY;
        for (let page = 0; page < 50 && offset < total; page += 1) {
            const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/posts`, { cookies, query: { n: pageSize, offset } });
            Object.assign(cookies, upstream.cookies);
            const parsed = postsResponseSchema.parse(upstream.data);
            posts.push(...parsed.posts);
            total = parsed.total ?? posts.length;
            if (!parsed.posts.length || parsed.posts.length < pageSize) break;
            offset += pageSize;
        }
        const unique = Array.from(new Map(posts.map((post) => [post.id, post])).values());
        await replaceCachedGroupPosts(ownerId, groupId.data, unique);
        const result = response({ posts: unique, cached: false });
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return result;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The group posts response was not valid." }, { status });
    }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/posts">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const body = createGroupPostRequestSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !body.success) return response({ error: "The group post is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPostPermission(groupId.data, body.data.roleIds, cookies);
        Object.assign(cookies, permission.cookies);
        const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/posts`, { method: "POST", cookies, body: body.data });
        Object.assign(cookies, upstream.cookies);
        const post = parseGroupPostForGroup(upstream.data, groupId.data);
        // The upstream create is not idempotent. Once it succeeds, never turn a
        // local projection failure into a retry prompt that could duplicate it.
        const [projection, session] = await Promise.allSettled([upsertCachedGroupPost(ownerId, groupId.data, post), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ post, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group post response was not valid." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
