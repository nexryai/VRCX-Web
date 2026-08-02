import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);

export async function GET(request: NextRequest, context: RouteContext<"/api/users/[userId]">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) {
        return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    }

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) {
        return NextResponse.json({ error: "Sign in to view this user." }, { status: 401 });
    }

    try {
        const upstream = await requestVrchat<unknown>(`users/${userId.data}`, { cookies });
        const response = NextResponse.json({ user: vrchatUserSchema.parse(upstream.data) });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat user response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
