import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedWorld, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatWorldSchema } from "@/lib/vrchat/types";

const worldIdSchema = z.string().regex(/^wrld_[0-9a-f-]{36}$/i);

export async function GET(request: NextRequest, context: RouteContext<"/api/worlds/[worldId]">) {
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!worldId.success) return NextResponse.json({ error: "The world ID is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedWorld(ownerId, worldId.data);
        if (cached) return worldResponse({ world: cached });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`worlds/${worldId.data}`, { cookies });
        const world = vrchatWorldSchema.parse(upstream.data);
        await upsertCachedWorlds(ownerId, [world], "lookup");
        const response = worldResponse({ world });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return response;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The world could not be loaded." }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

function worldResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
