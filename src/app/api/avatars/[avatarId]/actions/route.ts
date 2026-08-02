import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f-]{36}$/i);
const actionSchema = z.object({ action: z.enum(["enqueue-impostor", "select"]) });

export async function POST(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/actions">) {
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = actionSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar action is invalid." }, { status: 400 });

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update avatars." }, { status: 401 });
    const endpoint = body.data.action === "select" ? `avatars/${avatarId.data}/select` : `avatars/${avatarId.data}/impostor/enqueue`;

    try {
        const upstream = await requestVrchat<unknown>(endpoint, { method: body.data.action === "select" ? "PUT" : "POST", cookies });
        const response = NextResponse.json({ success: true });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The avatar action could not be completed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
