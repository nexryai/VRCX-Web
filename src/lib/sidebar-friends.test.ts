import { describe, expect, it } from "vitest";

import { groupSidebarFriendInstances, sortSidebarFriends } from "./sidebar-friends";
import type { VrchatUser } from "./vrchat/types";

const friend = (id: string, displayName: string, overrides: Partial<VrchatUser> = {}): VrchatUser => ({ id, displayName, state: "online", status: "active", location: "private", ...overrides });

describe("VRCX sidebar friend ordering", () => {
    it("applies configured comparisons followed by the alphabetical fallback", () => {
        const rows = [friend("b", "Beta", { location: "private" }), friend("c", "Charlie", { location: "wrld_00000000-0000-0000-0000-000000000001:1", status: "busy" }), friend("a", "Alpha", { location: "wrld_00000000-0000-0000-0000-000000000002:1", status: "join me" })];
        expect(sortSidebarFriends(rows, ["Sort Private to Bottom", "Sort by Status"]).map((row) => row.displayName)).toEqual(["Alpha", "Charlie", "Beta"]);
    });

    it("sorts online locations by the upstream location value and ignores it for non-online rows", () => {
        const rows = [friend("b", "Beta", { location: "wrld_00000000-0000-0000-0000-000000000002:1", world: { name: "Alpha World" } }), friend("a", "Alpha", { location: "wrld_00000000-0000-0000-0000-000000000001:1", world: { name: "Zulu World" } })];
        expect(sortSidebarFriends(rows, ["Sort by Location"]).map((row) => row.displayName)).toEqual(["Alpha", "Beta"]);
        expect(
            sortSidebarFriends(
                rows.map((row) => ({ ...row, state: "active" })),
                ["Sort by Location"],
            ).map((row) => row.displayName),
        ).toEqual(["Alpha", "Beta"]);
    });

    it("groups only repeated exact real instances and orders larger groups first", () => {
        const first = "wrld_00000000-0000-0000-0000-000000000001:1~region(jp)";
        const second = "wrld_00000000-0000-0000-0000-000000000002:2";
        const rows = [friend("a", "A", { location: first, world: { name: "First" } }), friend("b", "B", { location: first, world: { name: "First" } }), friend("c", "C", { location: second }), friend("d", "D", { location: "private" }), friend("e", "E", { location: first, state: "active" })];
        expect(groupSidebarFriendInstances(rows, ["Sort Alphabetically"])).toMatchObject([{ location: first, label: "First", friends: [{ displayName: "A" }, { displayName: "B" }] }]);
    });

    it("rejects malformed world IDs instead of treating them as real instances", () => {
        const malformed = "wrld_------------------------------------:1";
        expect(groupSidebarFriendInstances([friend("a", "A", { location: malformed }), friend("b", "B", { location: malformed })], [])).toEqual([]);
    });

    it("uses the restricted VRCX label for repeated age-gated instances until opted in", () => {
        const location = "wrld_00000000-0000-0000-0000-000000000001:1~ageGate";
        const rows = [friend("a", "A", { location, world: { name: "Age Restricted World" } }), friend("b", "B", { location, world: { name: "Age Restricted World" } })];
        expect(groupSidebarFriendInstances(rows, [], false)[0]?.label).toBe("Restricted");
        expect(groupSidebarFriendInstances(rows, [], true)[0]?.label).toBe("Age Restricted World");
    });
});
