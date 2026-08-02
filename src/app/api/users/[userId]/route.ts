import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { upsertCachedUser } from "@/lib/mongodb/user-repository";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);

export async function GET(_request: NextRequest, context: RouteContext<"/api/users/[userId]">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) {
        return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    }

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`users/${userId.data}`, { cookies });
        const user = vrchatUserSchema.parse(upstream.data);
        await upsertCachedUser(await requireActiveUserId(), user, "lookup");
        const response = NextResponse.json({ user });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat user response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) await clearVrchatSession();
        return response;
    }
}
