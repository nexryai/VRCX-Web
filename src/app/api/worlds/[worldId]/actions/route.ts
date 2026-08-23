import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { removeCachedWorld, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatWorldSchema } from "@/lib/vrchat/types";
import { optimisticWorldAfterAction, worldActionOwnershipError, worldActionSchema } from "@/lib/vrchat/world-actions";

const worldIdSchema = z.string().regex(/^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function POST(request: NextRequest, context: { params: Promise<{ worldId: string }> }) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    const body = worldActionSchema.safeParse(await request.json().catch(() => null));
    if (!worldId.success || !body.success) return response({ error: "The world action is invalid." }, 400);

    let expectedAuthCookie: string | undefined;
    let upstreamAccepted = false;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`worlds/${worldId.data}`, { cookies });
        const current = vrchatWorldSchema.parse(currentResponse.data);
        const currentCookies = { ...cookies, ...currentResponse.cookies };
        const ownershipError = worldActionOwnershipError(current, worldId.data, ownerId);
        if (ownershipError) {
            await persistRotatedVrchatCookies(currentCookies, cookies.auth);
            return response({ error: ownershipError }, 403);
        }

        const endpoint = body.data.action === "delete" ? `worlds/${worldId.data}` : `worlds/${worldId.data}/publish`;
        const method = body.data.action === "unpublish" || body.data.action === "delete" ? "DELETE" : "PUT";
        const upstream = await requestVrchat<unknown>(endpoint, { method, cookies: currentCookies, ...(body.data.action === "publish" ? { body: { worldId: worldId.data } } : {}) });
        upstreamAccepted = true;
        const rotatedCookies = { ...currentCookies, ...upstream.cookies };
        if (body.data.action === "delete") {
            const persistence = await Promise.allSettled([removeCachedWorld(ownerId, worldId.data), persistRotatedVrchatCookies(rotatedCookies, cookies.auth)]);
            return response({ deleted: true, refreshRequired: persistence.some((result) => result.status === "rejected") });
        }

        const parsedWorld = vrchatWorldSchema.safeParse(upstream.data);
        const world = parsedWorld.success && parsedWorld.data.id === current.id && parsedWorld.data.authorId === ownerId ? parsedWorld.data : optimisticWorldAfterAction(current, body.data.action);
        const persistence = await Promise.allSettled([upsertCachedWorlds(ownerId, [world], "lookup"), persistRotatedVrchatCookies(rotatedCookies, cookies.auth)]);
        return response({ world, refreshRequired: !parsedWorld.success || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        const fallback = upstreamAccepted ? "VRChat completed the world action, but local state needs reconciliation." : "The world action could not be completed.";
        return response({ error: error instanceof VrchatApiError ? `${fallback} ${error.message}` : fallback, ...(upstreamAccepted ? { upstreamAccepted: true, refreshRequired: true } : {}) }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
