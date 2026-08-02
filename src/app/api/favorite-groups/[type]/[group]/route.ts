import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { clearFavoriteGroupProjection, upsertFavoriteGroupProjection } from "@/lib/mongodb/projection-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatFavoriteGroupSchema, vrchatUserSchema } from "@/lib/vrchat/types";

const paramsSchema = z.object({
    type: z.enum(["avatar", "friend", "vrcPlusWorld", "world"]),
    group: z.string().regex(/^[a-z0-9_-]+$/i),
});
const updateSchema = z.object({ displayName: z.string().trim().min(1).max(64), visibility: z.enum(["friends", "private", "public"]) });

async function requestContext(_request: NextRequest, context: RouteContext<"/api/favorite-groups/[type]/[group]">, sessionGuard: { authCookie?: string }) {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return null;
    const cookies = await requireVrchatCookies();
    sessionGuard.authCookie = cookies.auth;
    const current = await requestVrchat<unknown>("auth/user", { cookies });
    await persistRotatedVrchatCookies(current.cookies, cookies.auth);
    const user = vrchatUserSchema.parse(current.data);
    return { params: params.data, cookies: { ...cookies, ...current.cookies }, userId: user.id };
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/favorite-groups/[type]/[group]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The favorite group update is invalid." }, { status: 400 });

    const sessionGuard: { authCookie?: string } = {};
    try {
        const resolved = await requestContext(request, context, sessionGuard);
        if (!resolved) return NextResponse.json({ error: "Sign in and provide a valid favorite group." }, { status: 401 });
        const { params, cookies, userId } = resolved;
        const upstream = await requestVrchat<unknown>(`favorite/group/${params.type}/${params.group}/${userId}`, { method: "PUT", cookies, body: { ...params, ...body.data } });
        const group = vrchatFavoriteGroupSchema.parse(upstream.data);
        await upsertFavoriteGroupProjection(userId, group);
        const response = NextResponse.json({ group });
        await persistRotatedVrchatCookies({ ...cookies, ...upstream.cookies }, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await groupError(error, "The favorite group could not be updated.", sessionGuard.authCookie);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/favorite-groups/[type]/[group]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const sessionGuard: { authCookie?: string } = {};
    try {
        const resolved = await requestContext(request, context, sessionGuard);
        if (!resolved) return NextResponse.json({ error: "Sign in and provide a valid favorite group." }, { status: 401 });
        const { params, cookies, userId } = resolved;
        const upstream = await requestVrchat<unknown>(`favorite/group/${params.type}/${params.group}/${userId}`, { method: "DELETE", cookies, body: params });
        await clearFavoriteGroupProjection(userId, params.type, params.group);
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies({ ...cookies, ...upstream.cookies }, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await groupError(error, "The favorite group could not be cleared.", sessionGuard.authCookie);
    }
}

async function groupError(error: unknown, fallback: string, expectedAuthCookie?: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response;
}
