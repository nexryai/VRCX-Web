import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedAvatar, removeCachedAvatar, upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const updateSchema = z
    .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).optional(),
        releaseStatus: z.enum(["private", "public"]).optional(),
    })
    .refine((body) => Object.values(body).some((value) => value !== undefined));

export async function GET(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!avatarId.success) return NextResponse.json({ error: "The avatar ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedAvatar(ownerId, avatarId.data);
        if (cached?.authorId && Array.isArray(cached.unityPackages)) return avatarResponse({ avatar: cached });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { cookies });
        const avatar = vrchatAvatarSchema.parse(upstream.data);
        await upsertCachedAvatars(ownerId, [avatar], "lookup");
        const response = avatarResponse({ avatar });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return response;
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be loaded.", expectedAuthCookie);
    }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar update is invalid." }, { status: 400 });

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "PUT", cookies, body: { id: avatarId.data, ...body.data } });
        const avatar = vrchatAvatarSchema.parse(upstream.data);
        await upsertCachedAvatars(await requireActiveUserId(), [avatar], "owned");
        const response = NextResponse.json({ avatar });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
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
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "DELETE", cookies });
        await removeCachedAvatar(await requireActiveUserId(), avatarId.data);
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
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

function avatarResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
