import { describe, expect, test } from "vitest";

import { buildHotWorldFriends, buildHotWorlds, type HotWorldVisit, hotWorldPeriodBounds } from "./hot-worlds";

const worldA = "wrld_00000000-0000-0000-0000-000000000201";
const worldB = "wrld_00000000-0000-0000-0000-000000000202";
const worldC = "wrld_00000000-0000-0000-0000-000000000203";
const aoi = "usr_00000000-0000-0000-0000-000000000211";
const cobalt = "usr_00000000-0000-0000-0000-000000000212";

function visit(id: string, userId: string, displayName: string, worldId: string, occurredAt: string): HotWorldVisit {
    return { id, userId, displayName, location: `${worldId}:${id}~region(us)`, occurredAt: new Date(occurredAt) };
}

describe("Hot Worlds remote GPS aggregation", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const bounds = hotWorldPeriodBounds(30, now);
    const visits = [
        visit("a-old-1", aoi, "Aoi", worldA, "2026-07-15T00:00:00.000Z"),
        visit("a-old-2", aoi, "Aoi", worldA, "2026-07-20T00:00:00.000Z"),
        visit("a-recent-1", aoi, "Aoi", worldA, "2026-08-01T00:00:00.000Z"),
        visit("a-recent-2", cobalt, "Cobalt", worldA, "2026-08-02T00:00:00.000Z"),
        visit("b-old-1", aoi, "Aoi", worldB, "2026-07-17T00:00:00.000Z"),
        visit("b-old-2", cobalt, "Cobalt", worldB, "2026-07-18T00:00:00.000Z"),
        visit("b-recent", aoi, "Aoi Renamed", worldB, "2026-08-03T00:00:00.000Z"),
        visit("c-old", aoi, "Aoi", worldC, "2026-07-19T00:00:00.000Z"),
        visit("c-recent", cobalt, "Cobalt", worldC, "2026-08-04T00:00:00.000Z"),
        visit("expired", cobalt, "Cobalt", worldA, "2026-07-01T00:00:00.000Z"),
        { id: "private", userId: aoi, displayName: "Aoi", location: "private", occurredAt: new Date("2026-08-05T00:00:00.000Z") },
    ];

    test("ranks by unique friends and visits while matching VRCX half-period trends", () => {
        const worlds = buildHotWorlds(visits, bounds.periodStart, bounds.recentStart, new Map([[worldA, "Alpha World"]]));
        expect(worlds.map((world) => world.worldId)).toEqual([worldA, worldB, worldC]);
        expect(worlds[0]).toMatchObject({ worldName: "Alpha World", visitCount: 4, uniqueFriends: 2, trend: "rising", lastVisited: "2026-08-02T00:00:00.000Z" });
        expect(worlds[1]).toMatchObject({ worldName: worldB, visitCount: 3, uniqueFriends: 2, trend: "cooling" });
        expect(worlds[2]).toMatchObject({ visitCount: 2, uniqueFriends: 2, trend: "stable" });
    });

    test("groups friend detail and retains the latest observed display name", () => {
        expect(buildHotWorldFriends(visits, worldB, bounds.periodStart)).toEqual([
            { userId: aoi, displayName: "Aoi Renamed", visitCount: 2, lastVisit: "2026-08-03T00:00:00.000Z" },
            { userId: cobalt, displayName: "Cobalt", visitCount: 1, lastVisit: "2026-07-18T00:00:00.000Z" },
        ]);
    });

    test("uses VRCX's floored half-period boundary for seven days", () => {
        expect(hotWorldPeriodBounds(7, now)).toEqual({ periodStart: new Date("2026-08-03T00:00:00.000Z"), recentStart: new Date("2026-08-07T00:00:00.000Z") });
    });
});
