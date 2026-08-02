import { NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const worldRowSchema = z
    .object({
        index: z.union([z.string(), z.number()]),
        name: z.string(),
        sortHeading: z.string().optional(),
        sortOrder: z.string().optional(),
        sortOwnership: z.string().optional(),
        tag: z.string().optional(),
    })
    .passthrough();

const configSchema = z
    .object({
        dynamicWorldRows: z.array(worldRowSchema).default([]),
    })
    .passthrough();

export async function GET() {
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>("config", { cookies });
        const parsed = configSchema.parse(upstream.data);
        const response = NextResponse.json({ worldRows: parsed.dynamicWorldRows });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat search configuration was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return NextResponse.json({ error: message }, { status });
    }
}
