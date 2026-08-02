import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

const querySchema = z.object({
    n: z.coerce.number().int().min(1).max(100).default(100),
    offset: z.coerce.number().int().min(0).max(7500).default(0),
    offline: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) {
        return NextResponse.json({ error: "The friend-list query is invalid." }, { status: 400 });
    }

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) {
        return NextResponse.json({ error: "Sign in to view friends." }, { status: 401 });
    }

    try {
        const upstream = await requestVrchat<unknown>("auth/user/friends", {
            cookies,
            query: query.data,
        });
        const friends = z.array(vrchatUserSchema).parse(upstream.data);
        const response = NextResponse.json({ friends });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat friend list was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
