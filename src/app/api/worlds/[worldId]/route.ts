import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedWorld, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatWorldSchema } from "@/lib/vrchat/types";
import { buildWorldUpstreamUpdate, worldOwnershipError, worldUpdateSchema } from "@/lib/vrchat/world-metadata";

const worldIdSchema = z.string().regex(/^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

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

export async function PATCH(request: NextRequest, context: RouteContext<"/api/worlds/[worldId]">) {
    if (!isMutationOriginAllowed(request)) return worldResponse({ error: "Cross-site requests are not allowed." }, 403);
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    const body = worldUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!worldId.success || !body.success) return worldResponse({ error: "The world update is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`worlds/${worldId.data}`, { cookies });
        const current = vrchatWorldSchema.parse(currentResponse.data);
        const ownershipError = worldOwnershipError(current, worldId.data, ownerId);
        if (ownershipError) {
            await persistRotatedVrchatCookies(currentResponse.cookies, cookies.auth);
            return worldResponse({ error: ownershipError }, 403);
        }
        const mutation = buildWorldUpstreamUpdate(current, body.data);
        const upstream = await requestVrchat<unknown>(`worlds/${worldId.data}`, { method: "PUT", cookies: { ...cookies, ...currentResponse.cookies }, body: { id: worldId.data, ...mutation.upstream } });
        const parsed = vrchatWorldSchema.safeParse(upstream.data);
        const world = parsed.success && parsed.data.id === worldId.data && parsed.data.authorId === ownerId ? parsed.data : mutation.optimistic;
        const persistence = await Promise.allSettled([upsertCachedWorlds(ownerId, [world], "lookup"), persistRotatedVrchatCookies({ ...currentResponse.cookies, ...upstream.cookies }, cookies.auth)]);
        return worldResponse({ world, refreshRequired: !parsed.success || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : error instanceof Error && error.message.includes("capacity") ? 400 : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return worldResponse({ error: error instanceof VrchatApiError || error instanceof Error ? error.message : "The world could not be updated." }, status);
    }
}

function worldResponse(payload: object, status = 200) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
