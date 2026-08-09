import { type NextRequest, NextResponse } from "next/server";

import { isGroupInstanceFor } from "@/lib/group-instances";
import { upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { getCachedGroupInstances, replaceCachedGroupInstances } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupInstancesResponseSchema } from "@/lib/vrchat/types";

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/instances">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    if (!groupId.success) return response({ error: "The group ID is invalid." }, 400);

    const ownerId = await requireActiveUserId();
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!refresh) {
        const cached = await getCachedGroupInstances(ownerId, groupId.data);
        // An empty complete snapshot is still a valid cache hit.
        if (cached) return response({ ...cached, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`users/${ownerId}/instances/groups/${groupId.data}`, { cookies });
        const parsed = vrchatGroupInstancesResponseSchema.parse(upstream.data);
        if (parsed.instances.some((instance) => !isGroupInstanceFor(instance, groupId.data))) {
            throw new Error("The group instances response did not match the requested group.");
        }

        const observedAt = new Date();
        await Promise.all([replaceCachedGroupInstances(ownerId, groupId.data, parsed.instances, parsed.fetchedAt, observedAt), upsertCachedWorlds(ownerId, Array.from(new Map(parsed.instances.map((instance) => [instance.world.id, instance.world])).values()), "lookup", observedAt)]);
        const result = response({ instances: parsed.instances, upstreamFetchedAt: parsed.fetchedAt, observedAt, cached: false });
        await persistRotatedVrchatCookies(upstream.cookies, expectedAuthCookie);
        return result;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group instances response was not valid." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
