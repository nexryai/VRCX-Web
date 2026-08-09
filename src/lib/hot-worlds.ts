import { z } from "zod";

import { parseObservableLocation } from "./game-log/location";
import { userIdSchema, worldIdSchema } from "./vrchat/ids";

export const hotWorldPeriodSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type HotWorldPeriod = z.infer<typeof hotWorldPeriodSchema>;

export const hotWorldSchema = z.object({
    worldId: worldIdSchema,
    worldName: z.string(),
    visitCount: z.number().int().positive(),
    uniqueFriends: z.number().int().positive(),
    lastVisited: z.iso.datetime(),
    trend: z.enum(["cooling", "rising", "stable"]),
});

export const hotWorldFriendSchema = z.object({
    userId: userIdSchema,
    displayName: z.string(),
    visitCount: z.number().int().positive(),
    lastVisit: z.iso.datetime(),
});

export const hotWorldsResponseSchema = z.object({ days: hotWorldPeriodSchema, worlds: z.array(hotWorldSchema) });
export const hotWorldFriendsResponseSchema = z.object({ days: hotWorldPeriodSchema, worldId: worldIdSchema, friends: z.array(hotWorldFriendSchema) });

export type HotWorld = z.infer<typeof hotWorldSchema>;
export type HotWorldFriend = z.infer<typeof hotWorldFriendSchema>;

export type HotWorldVisit = {
    id: string;
    userId: string;
    displayName: string;
    location?: string;
    occurredAt: Date;
};

type WorldAccumulator = {
    visits: number;
    friends: Set<string>;
    oldFriends: Set<string>;
    recentFriends: Set<string>;
    lastVisited: Date;
};

/** Closely translates VRCX's feed GPS ranking and half-period trend queries. */
export function buildHotWorlds(visits: HotWorldVisit[], periodStart: Date, recentStart: Date, worldNames: ReadonlyMap<string, string>, limit = 30): HotWorld[] {
    const worlds = new Map<string, WorldAccumulator>();
    for (const visit of visits) {
        if (visit.occurredAt < periodStart) continue;
        const parsed = parseObservableLocation(visit.location);
        if (!parsed?.worldId) continue;
        const entry = worlds.get(parsed.worldId) ?? { visits: 0, friends: new Set<string>(), oldFriends: new Set<string>(), recentFriends: new Set<string>(), lastVisited: visit.occurredAt };
        entry.visits += 1;
        entry.friends.add(visit.userId);
        (visit.occurredAt < recentStart ? entry.oldFriends : entry.recentFriends).add(visit.userId);
        if (visit.occurredAt > entry.lastVisited) entry.lastVisited = visit.occurredAt;
        worlds.set(parsed.worldId, entry);
    }

    return [...worlds]
        .map(([worldId, entry]) => ({
            worldId,
            worldName: worldNames.get(worldId) || worldId,
            visitCount: entry.visits,
            uniqueFriends: entry.friends.size,
            lastVisited: entry.lastVisited.toISOString(),
            trend: entry.recentFriends.size > entry.oldFriends.size ? ("rising" as const) : entry.recentFriends.size < entry.oldFriends.size ? ("cooling" as const) : ("stable" as const),
        }))
        .toSorted((left, right) => right.uniqueFriends - left.uniqueFriends || right.visitCount - left.visitCount || right.lastVisited.localeCompare(left.lastVisited) || left.worldId.localeCompare(right.worldId))
        .slice(0, limit);
}

export function buildHotWorldFriends(visits: HotWorldVisit[], worldId: string, periodStart: Date): HotWorldFriend[] {
    const friends = new Map<string, { displayName: string; visitCount: number; lastVisit: Date }>();
    for (const visit of visits) {
        if (visit.occurredAt < periodStart || parseObservableLocation(visit.location)?.worldId !== worldId) continue;
        const current = friends.get(visit.userId);
        if (!current) {
            friends.set(visit.userId, { displayName: visit.displayName, visitCount: 1, lastVisit: visit.occurredAt });
            continue;
        }
        current.visitCount += 1;
        if (visit.occurredAt > current.lastVisit) {
            current.lastVisit = visit.occurredAt;
            current.displayName = visit.displayName;
        }
    }
    return [...friends]
        .map(([userId, friend]) => ({ userId, displayName: friend.displayName, visitCount: friend.visitCount, lastVisit: friend.lastVisit.toISOString() }))
        .toSorted((left, right) => right.visitCount - left.visitCount || right.lastVisit.localeCompare(left.lastVisit) || left.displayName.localeCompare(right.displayName));
}

export function hotWorldPeriodBounds(days: HotWorldPeriod, now: Date) {
    return {
        periodStart: new Date(now.getTime() - days * 86_400_000),
        // VRCX intentionally uses floor(days / 2), including a 4d/3d split for 7d.
        recentStart: new Date(now.getTime() - Math.floor(days / 2) * 86_400_000),
    };
}
