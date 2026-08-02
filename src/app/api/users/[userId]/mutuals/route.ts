import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);
const querySchema = z.object({ offset: z.coerce.number().int().min(0).max(5_000).default(0) });

export async function GET(request: NextRequest, context: RouteContext<"/api/users/[userId]/mutuals">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!userId.success || !query.success) return NextResponse.json({ error: "The mutual-friends query is invalid." }, { status: 400 });

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>(`users/${userId.data}/mutuals/friends`, { cookies, query: { n: 100, offset: query.data.offset } });
        const response = NextResponse.json({ mutuals: z.array(vrchatUserSchema).parse(upstream.data) });
        await persistRotatedVrchatCookies(upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat mutual-friends response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) await clearVrchatSession();
        return response;
    }
}
