import { describe, expect, it } from "vitest";

import { parseObservableLocation, unobservableReason } from "./location";

describe("remote Game Log locations", () => {
    it("parses world, instance, and group identifiers from a VRChat location", () => {
        expect(parseObservableLocation("wrld_12345678-1234-1234-1234-123456789abc:98765~group(grp_abcdefab-cdef-abcd-efab-cdefabcdefab)~region(us)")).toEqual({
            location: "wrld_12345678-1234-1234-1234-123456789abc:98765~group(grp_abcdefab-cdef-abcd-efab-cdefabcdefab)~region(us)",
            worldId: "wrld_12345678-1234-1234-1234-123456789abc",
            instanceId: "98765",
            groupId: "grp_abcdefab-cdef-abcd-efab-cdefabcdefab",
        });
    });

    it("does not turn private, offline, or traveling sentinels into sessions", () => {
        expect(parseObservableLocation("private")).toBeNull();
        expect(parseObservableLocation("offline")).toBeNull();
        expect(parseObservableLocation("traveling")).toBeNull();
        expect(unobservableReason("private")).toBe("private");
        expect(unobservableReason("offline")).toBe("offline");
    });
});
