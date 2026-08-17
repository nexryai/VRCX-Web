import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getAvatarStyleSnapshot, replaceAvatarStyleSnapshot } from "@/lib/mongodb/avatar-style-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarStyleSchema } from "@/lib/vrchat/types";

const avatarStylesSchema = z.array(vrchatAvatarStyleSchema).max(500);

export async function GET(request: NextRequest) {
    const ownerId = await requireActiveUserId();
    if (request.nextUrl.searchParams.get("refresh") !== "true") {
        const cached = await getAvatarStyleSnapshot(ownerId);
        if (cached) return avatarStylesResponse({ styles: cached.styles, observedAt: cached.observedAt.toISOString() });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>("avatarStyles", { cookies });
        const styles = avatarStylesSchema.parse(upstream.data);
        const observedAt = new Date();
        await Promise.all([replaceAvatarStyleSnapshot(ownerId, styles, observedAt), persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
        return avatarStylesResponse({ styles, observedAt: observedAt.toISOString() });
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The avatar styles response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return avatarStylesResponse({ error: message }, status);
    }
}

function avatarStylesResponse(payload: object, status = 200) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
