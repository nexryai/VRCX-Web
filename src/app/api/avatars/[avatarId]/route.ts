import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
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
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar update is invalid." }, { status: 400 });

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update avatars." }, { status: 401 });

    try {
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "PUT", cookies, body: { id: avatarId.data, ...body.data } });
        const response = NextResponse.json({ avatar: vrchatAvatarSchema.parse(upstream.data) });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return avatarMutationError(error, "The avatar could not be updated.");
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]">) {
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return NextResponse.json({ error: "The avatar ID is invalid." }, { status: 400 });

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update avatars." }, { status: 401 });

    try {
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "DELETE", cookies });
        const response = NextResponse.json({ success: true });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return avatarMutationError(error, "The avatar could not be deleted.");
    }
}

function avatarMutationError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) clearVrchatCookies(response);
    return response;
}
