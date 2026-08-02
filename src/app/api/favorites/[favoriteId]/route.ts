import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { deactivateFavorite } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const favoriteIdSchema = z.string().regex(/^(avtr|usr|wrld)_[0-9a-f-]{36}$/i);

export async function DELETE(request: NextRequest, context: RouteContext<"/api/favorites/[favoriteId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const favoriteId = favoriteIdSchema.safeParse((await context.params).favoriteId);
    if (!favoriteId.success) return NextResponse.json({ error: "The favorite ID is invalid." }, { status: 400 });

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`favorites/${favoriteId.data}`, { method: "DELETE", cookies });
        await deactivateFavorite(await requireActiveUserId(), favoriteId.data);
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The favorite could not be removed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) await clearVrchatSession();
        return response;
    }
}
