import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";

const favoriteIdSchema = z.string().regex(/^(avtr|usr|wrld)_[0-9a-f-]{36}$/i);

export async function DELETE(request: NextRequest, context: RouteContext<"/api/favorites/[favoriteId]">) {
    const favoriteId = favoriteIdSchema.safeParse((await context.params).favoriteId);
    if (!favoriteId.success) return NextResponse.json({ error: "The favorite ID is invalid." }, { status: 400 });

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update favorites." }, { status: 401 });

    try {
        const upstream = await requestVrchat<unknown>(`favorites/${favoriteId.data}`, { method: "DELETE", cookies });
        const response = NextResponse.json({ success: true });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The favorite could not be removed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
