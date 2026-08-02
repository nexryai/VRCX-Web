import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema } from "@/lib/vrchat/types";

const querySchema = z.object({
    offset: z.coerce.number().int().min(0).max(5_000).default(0),
});

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The avatar query is invalid." }, { status: 400 });

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to view avatars." }, { status: 401 });

    try {
        const upstream = await requestVrchat<unknown>("avatars", {
            cookies,
            query: {
                n: 50,
                offset: query.data.offset,
                sort: "updated",
                order: "descending",
                releaseStatus: "all",
                user: "me",
            },
        });
        const response = NextResponse.json({ avatars: z.array(vrchatAvatarSchema).parse(upstream.data) });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat avatar response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
