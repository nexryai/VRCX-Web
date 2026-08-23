import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { getWorldPersistSnapshot, setWorldPersistSnapshot } from "@/lib/mongodb/world-persist-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const worldIdSchema = z.string().regex(/^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function GET(_request: NextRequest, context: { params: Promise<{ worldId: string }> }) {
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    if (!worldId.success) return response({ error: "The world ID is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    let ownerId: string | undefined;
    try {
        const state = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        [ownerId] = state;
        const cookies = state[1];
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`users/${ownerId}/${worldId.data}/persist/exists`, { cookies });
        const hasPersistData = z.boolean().parse(upstream.data);
        const persistence = await Promise.allSettled([setWorldPersistSnapshot(ownerId, worldId.data, hasPersistData), persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
        return response({ hasPersistData, stale: false, refreshRequired: persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        // VRChat reports the authoritative "no persistence exists" state as 404.
        if (status === 404 && ownerId) {
            const persistence = await Promise.allSettled([setWorldPersistSnapshot(ownerId, worldId.data, false)]);
            return response({ hasPersistData: false, stale: false, refreshRequired: persistence.some((result) => result.status === "rejected") });
        }
        if (status !== 401 && ownerId) {
            const cached = await getWorldPersistSnapshot(ownerId, worldId.data).catch(() => null);
            if (cached) return response({ hasPersistData: cached.hasPersistData, observedAt: cached.observedAt.toISOString(), stale: true });
        }
        return response({ error: error instanceof VrchatApiError ? error.message : "Persistent-data state could not be loaded." }, status);
    }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ worldId: string }> }) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    if (!worldId.success) return response({ error: "The world ID is invalid." }, 400);
    let expectedAuthCookie: string | undefined;
    let upstreamAccepted = false;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`users/${ownerId}/${worldId.data}/persist`, { method: "DELETE", cookies });
        upstreamAccepted = true;
        const persistence = await Promise.allSettled([setWorldPersistSnapshot(ownerId, worldId.data, false), persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
        return response({ deleted: true, hasPersistData: false, refreshRequired: persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        const fallback = upstreamAccepted ? "Persistent data was deleted, but local state needs reconciliation." : "Persistent data could not be deleted.";
        return response({ error: error instanceof VrchatApiError ? `${fallback} ${error.message}` : fallback, ...(upstreamAccepted ? { upstreamAccepted: true, refreshRequired: true } : {}) }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
