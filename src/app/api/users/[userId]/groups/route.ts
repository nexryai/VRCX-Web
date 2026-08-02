import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedGroups } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);

export async function GET(_request: NextRequest, context: RouteContext<"/api/users/[userId]/groups">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`users/${userId.data}/groups`, { cookies });
        const groups = z.array(vrchatGroupSchema).parse(upstream.data);
        await upsertCachedGroups(await requireActiveUserId(), groups, "lookup");
        const response = NextResponse.json({ groups });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat groups response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return NextResponse.json({ error: message }, { status });
    }
}
