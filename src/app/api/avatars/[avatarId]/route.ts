import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { removeCachedAvatar, upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f-]{36}$/i);
const updateSchema = z
    .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).optional(),
        releaseStatus: z.enum(["private", "public"]).optional(),
    })
    .refine((body) => Object.values(body).some((value) => value !== undefined));

export async function PATCH(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar update is invalid." }, { status: 400 });

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "PUT", cookies, body: { id: avatarId.data, ...body.data } });
        const avatar = vrchatAvatarSchema.parse(upstream.data);
        await upsertCachedAvatars(await requireActiveUserId(), [avatar], "owned");
        const response = NextResponse.json({ avatar });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be updated.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return NextResponse.json({ error: "The avatar ID is invalid." }, { status: 400 });

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "DELETE", cookies });
        await removeCachedAvatar(await requireActiveUserId(), avatarId.data);
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await avatarMutationError(error, "The avatar could not be deleted.");
    }
}

async function avatarMutationError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) await clearVrchatSession();
    return response;
}
