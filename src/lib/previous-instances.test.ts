import { describe, expect, test } from "vitest";

import { buildRemoteUserPreviousInstances } from "./previous-instances";

const worldA = "wrld_00000000-0000-0000-0000-000000000101";
const worldB = "wrld_00000000-0000-0000-0000-000000000102";
const creatorId = "usr_00000000-0000-0000-0000-000000000104";
const locationA = `${worldA}:111~friends(${creatorId})~region(us)`;
const locationB = `${worldB}:222~group(grp_00000000-0000-0000-0000-000000000103)~region(eu)`;

describe("remote Previous Instances", () => {
    test("builds observed location intervals without inventing local join precision", () => {
        const rows = buildRemoteUserPreviousInstances([
            { id: "online", type: "Online", current: locationA, occurredAt: new Date("2026-08-09T10:00:00.000Z") },
            { id: "duplicate", type: "GPS", current: locationA, occurredAt: new Date("2026-08-09T10:05:00.000Z") },
            { id: "move", type: "GPS", current: locationB, occurredAt: new Date("2026-08-09T10:20:00.000Z") },
            { id: "offline", type: "Offline", occurredAt: new Date("2026-08-09T10:50:00.000Z") },
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ id: "move", location: locationB, worldId: worldB, groupId: "grp_00000000-0000-0000-0000-000000000103", durationMs: 30 * 60_000, current: false, observationCount: 1, source: "remote-user-observation", endPrecision: "observed" });
        expect(rows[1]).toMatchObject({ id: "online", location: locationA, worldId: worldA, creatorId, durationMs: 20 * 60_000, current: false, observationCount: 2 });
    });

    test("retains the first GPS transition's previously observed instance", () => {
        const rows = buildRemoteUserPreviousInstances([
            {
                id: "first-gps",
                type: "GPS",
                previous: locationA,
                current: locationB,
                previousSnapshotObservedAt: new Date("2026-08-09T09:30:00.000Z"),
                occurredAt: new Date("2026-08-09T10:00:00.000Z"),
            },
            { id: "offline", type: "Offline", occurredAt: new Date("2026-08-09T10:20:00.000Z") },
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ id: "first-gps:previous", location: locationA, startedAt: "2026-08-09T09:30:00.000Z", lastObservedAt: "2026-08-09T10:00:00.000Z", durationMs: 30 * 60_000 });
    });

    test("marks only a matching current projection as open", () => {
        const rows = buildRemoteUserPreviousInstances([{ id: "gps", type: "GPS", current: locationA, occurredAt: new Date("2026-08-09T11:00:00.000Z") }], { location: locationA, observedAt: new Date("2026-08-09T11:45:00.000Z") });
        expect(rows).toEqual([expect.objectContaining({ id: "gps", current: true, durationMs: 45 * 60_000, lastObservedAt: "2026-08-09T11:45:00.000Z" })]);
        expect(rows[0]?.endPrecision).toBeUndefined();
    });

    test("does not turn private or malformed values into instances", () => {
        expect(
            buildRemoteUserPreviousInstances([
                { id: "private", type: "Online", current: "private", occurredAt: new Date("2026-08-09T12:00:00.000Z") },
                { id: "malformed", type: "GPS", current: "wrld_bad:123", occurredAt: new Date("2026-08-09T12:10:00.000Z") },
            ]),
        ).toEqual([]);
    });
});
