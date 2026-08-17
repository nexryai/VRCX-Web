import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedAvatar, removeCachedAvatar, upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { isAvatarBlocked } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { avatarOwnershipError, avatarUpdateSchema } from "@/lib/vrchat/avatar-metadata";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export async function GET(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!avatarId.success) return NextResponse.json({ error: "The avatar ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedAvatar(ownerId, avatarId.data);
        if (cached?.authorId && Array.isArray(cached.unityPackages)) return avatarResponse({ avatar: cached, isBlocked: await isAvatarBlocked(ownerId, avatarId.data) });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { cookies });
        const avatar = vrchatAvatarSchema.parse(upstream.data);
        await upsertCachedAvatars(ownerId, [avatar], "lookup");
        const response = avatarResponse({ avatar, isBlocked: await isAvatarBlocked(ownerId, avatarId.data) });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return response;
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be loaded.", expectedAuthCookie);
    }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = avatarUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar update is invalid." }, { status: 400 });

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { cookies });
        const current = vrchatAvatarSchema.parse(currentResponse.data);
        const ownershipError = avatarOwnershipError(current, avatarId.data, ownerId, "update");
        if (ownershipError) {
            await persistRotatedVrchatCookies(currentResponse.cookies, cookies.auth);
            return avatarResponse({ error: ownershipError }, 403);
        }
        const currentCookies = { ...cookies, ...currentResponse.cookies };
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "PUT", cookies: currentCookies, body: { id: avatarId.data, ...body.data } });
        const parsed = vrchatAvatarSchema.safeParse(upstream.data);
        const avatar = parsed.success && parsed.data.id === avatarId.data && parsed.data.authorId === ownerId ? parsed.data : { ...current, ...body.data };
        const persistence = await Promise.allSettled([upsertCachedAvatars(ownerId, [avatar], "owned"), persistRotatedVrchatCookies({ ...currentCookies, ...upstream.cookies }, cookies.auth)]);
        return avatarResponse({ avatar, refreshRequired: !parsed.success || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be updated.", expectedAuthCookie);
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return NextResponse.json({ error: "The avatar ID is invalid." }, { status: 400 });

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { cookies });
        const current = vrchatAvatarSchema.parse(currentResponse.data);
        const ownershipError = avatarOwnershipError(current, avatarId.data, ownerId, "delete");
        if (ownershipError) {
            await persistRotatedVrchatCookies(currentResponse.cookies, cookies.auth);
            return avatarResponse({ error: ownershipError }, 403);
        }
        const currentCookies = { ...cookies, ...currentResponse.cookies };
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "DELETE", cookies: currentCookies });
        const persistence = await Promise.allSettled([removeCachedAvatar(ownerId, avatarId.data), persistRotatedVrchatCookies({ ...currentCookies, ...upstream.cookies }, cookies.auth)]);
        return avatarResponse({ success: true, refreshRequired: persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be deleted.", expectedAuthCookie);
    }
}

async function avatarMutationError(error: unknown, fallback: string, expectedAuthCookie?: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response;
}

function avatarResponse(payload: object, status = 200) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
