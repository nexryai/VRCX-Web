import { describe, expect, it } from "vitest";

import { isGroupInstanceFor } from "../group-instances";
import { vrchatGroupInstancesResponseSchema } from "./types";

const groupId = "grp_00000000-0000-0000-0000-000000000001";
const worldId = "wrld_00000000-0000-0000-0000-000000000002";

describe("VRChat group-instance response", () => {
    it("validates the complete fields rendered and persisted by Group Dialog", () => {
        const location = `${worldId}:123~group(${groupId})~region(us)`;
        const result = vrchatGroupInstancesResponseSchema.parse({
            fetchedAt: "2026-08-09T10:00:00.000Z",
            instances: [{ id: location, location, instanceId: `123~group(${groupId})~region(us)`, worldId, ownerId: groupId, userCount: 8, capacity: 40, unknownFutureField: true, world: { id: worldId, name: "Group World" } }],
        });

        expect(result.instances[0]).toMatchObject({ location, ownerId: groupId, userCount: 8, unknownFutureField: true, world: { name: "Group World" } });
        expect(isGroupInstanceFor(result.instances[0], groupId)).toBe(true);
    });

    it("rejects negative player counts and incomplete embedded worlds", () => {
        const base = { id: "location", location: "location", instanceId: "instance", worldId, ownerId: groupId };
        expect(vrchatGroupInstancesResponseSchema.safeParse({ instances: [{ ...base, userCount: -1, world: { id: worldId, name: "World" } }] }).success).toBe(false);
        expect(vrchatGroupInstancesResponseSchema.safeParse({ instances: [{ ...base, world: { id: worldId } }] }).success).toBe(false);
    });

    it("requires the requested group and world to match the canonical location tags", () => {
        const location = `${worldId}:123~group(${groupId})~region(us)`;
        const instance = vrchatGroupInstancesResponseSchema.parse({ instances: [{ id: location, location, instanceId: "123", worldId, ownerId: groupId, world: { id: worldId, name: "World" } }] }).instances[0];
        expect(isGroupInstanceFor(instance, "grp_00000000-0000-0000-0000-000000000099")).toBe(false);
        expect(isGroupInstanceFor({ ...instance, worldId: "wrld_00000000-0000-0000-0000-000000000099" }, groupId)).toBe(false);
        expect(isGroupInstanceFor({ ...instance, location: `${worldId}:123~group(${groupId}-suffix)` }, groupId)).toBe(false);
        expect(isGroupInstanceFor({ ...instance, location: `${worldId}:123~group(grp_00000000-0000-0000-0000-000000000099)` }, groupId)).toBe(false);
    });
});
