import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatPlayerModerationSchema } from "@/lib/vrchat/types";

const deleteSchema = z.object({
    moderated: z.string().regex(/^usr_[0-9a-f-]{36}$/i),
    type: z.string().trim().min(1).max(64),
});

export async function GET(_request: NextRequest) {
    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>("auth/user/playermoderations", { cookies });
        const moderations = z.array(vrchatPlayerModerationSchema).parse(upstream.data);
        const response = NextResponse.json({ moderations });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await moderationError(error, "The VRChat moderation response was not valid.");
    }
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ error: "The moderation request is invalid." }, { status: 400 });
    }

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>("auth/user/unplayermoderate", {
            method: "PUT",
            cookies,
            body: body.data,
        });
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await moderationError(error, "The moderation could not be removed.");
    }
}

async function moderationError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) await clearVrchatSession();
    return response;
}
