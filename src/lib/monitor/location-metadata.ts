import "server-only";

import { parseObservableLocation } from "@/lib/game-log/location";
import { getFreshCachedLocationMetadata, upsertCachedGroups, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requestVrchat, VrchatApiError, type VrchatCookies } from "@/lib/vrchat/client";
import { vrchatGroupSchema, vrchatWorldSchema } from "@/lib/vrchat/types";

export async function resolveLocationMetadata(ownerId: string, location: string | undefined, cookies: VrchatCookies): Promise<{ worldName?: string; groupName?: string; cookies: VrchatCookies }> {
    const parsed = parseObservableLocation(location);
    if (!parsed?.worldId) return { cookies };
    const cached = await getFreshCachedLocationMetadata(ownerId, parsed.worldId, parsed.groupId);
    if (cached.worldName && (!parsed.groupId || cached.groupName)) return { ...cached, cookies };

    let currentCookies = cookies;
    let worldName = cached.worldName;
    let groupName = cached.groupName;
    if (!worldName) {
        try {
            const response = await requestVrchat<unknown>(`worlds/${parsed.worldId}`, { cookies: currentCookies });
            currentCookies = { ...currentCookies, ...response.cookies };
            const world = vrchatWorldSchema.parse(response.data);
            worldName = world.name;
            await upsertCachedWorlds(ownerId, [world], "session");
        } catch (error) {
            if (error instanceof VrchatApiError && error.status === 401) throw error;
            // Keep the location boundary when optional metadata is temporarily
            // unavailable; later observations can repair the cached name.
        }
    }

    if (parsed.groupId && !groupName) {
        try {
            const response = await requestVrchat<unknown>(`groups/${parsed.groupId}`, { cookies: currentCookies });
            currentCookies = { ...currentCookies, ...response.cookies };
            const group = vrchatGroupSchema.parse(response.data);
            groupName = group.name;
            await upsertCachedGroups(ownerId, [group], "session");
        } catch (error) {
            if (error instanceof VrchatApiError && error.status === 401) throw error;
        }
    }

    return { worldName, groupName, cookies: currentCookies };
}
