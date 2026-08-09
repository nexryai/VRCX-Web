import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { listCachedGroupPosts, replaceCachedGroupPosts } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupPostSchema } from "@/lib/vrchat/types";

const groupIdSchema = z.string().regex(/^grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const postsResponseSchema = z.object({ posts: z.array(vrchatGroupPostSchema).default([]), total: z.number().optional() }).passthrough();

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/posts">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success) return NextResponse.json({ error: "The group ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await listCachedGroupPosts(ownerId, groupId.data);
        if (cached.length) return response({ posts: cached, cached: true });
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

function response(payload: object) {
    const result = NextResponse.json(payload);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
