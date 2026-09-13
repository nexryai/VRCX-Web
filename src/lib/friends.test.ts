import { describe, expect, it } from "vitest";

import { groupFriendsByLocation, locationLabel } from "./friends";
import type { VrchatUser } from "./vrchat/types";

const makeFriend = (id: string, displayName: string, location: string, worldName?: string): VrchatUser => ({
    id,
    displayName,
    location,
    ...(worldName ? { world: { name: worldName } } : {}),
});

describe("friend location helpers", () => {
    it("prefers the returned world name over a raw location id", () => {
        expect(locationLabel(makeFriend("usr_1", "A", "wrld_1:123", "Example World"))).toBe("Example World");
    });

    it("hides age-gated locations by default and reveals them only after opt-in", () => {
        const friend = makeFriend("usr_1", "A", "wrld_1:123~ageGate", "Age Restricted World");
        expect(locationLabel(friend)).toBe("Restricted");
        expect(locationLabel(friend, true)).toBe("Age Restricted World");
    });

    it("adds the parsed VRCX instance name only after the global opt-in", () => {
        const friend = makeFriend("usr_1", "A", "wrld_1:123~region(jp)", "Example World");
        expect(locationLabel(friend)).toBe("Example World");
        expect(locationLabel(friend, false, true)).toBe("Example World · #123");
    });

    it("groups locations by size and friends by display name", () => {
        const groups = groupFriendsByLocation([makeFriend("usr_1", "Zulu", "private"), makeFriend("usr_2", "Alpha", "private"), makeFriend("usr_3", "Beta", "wrld_1", "A World")]);

        expect(groups[0].location).toBe("Private");
        expect(groups[0].members.map((friend) => friend.displayName)).toEqual(["Alpha", "Zulu"]);
        expect(groups[1].location).toBe("A World");
    });
});
