import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);

export async function DELETE(request: NextRequest, context: RouteContext<"/api/friends/[userId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) {
        return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    }

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`auth/user/friends/${userId.data}`, {
            method: "DELETE",
            cookies,
        });
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The friend could not be removed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) await clearVrchatSession();
        return response;
    }
}
