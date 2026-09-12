import { describe, expect, it } from "vitest";

import { normalizeSidebarFavoriteGroupKeys, orderSidebarFavoriteGroups, resolveSidebarFavoriteGroupKeys, type SidebarFavoriteGroup } from "./sidebar-favorite-groups";

const groups: SidebarFavoriteGroup[] = [
    { key: "friend:group_0", displayName: "Remote", local: false, friendIds: ["a"] },
    { key: "local:lfg_00000000-0000-0000-0000-000000000001", displayName: "Local", local: true, friendIds: ["b"] },
];

describe("VRCX sidebar favorite groups", () => {
    it("uses every known group for the compact empty selection", () => {
        expect(resolveSidebarFavoriteGroupKeys([], groups)).toEqual(groups.map((group) => group.key));
        expect(
            normalizeSidebarFavoriteGroupKeys(
                groups.map((group) => group.key),
                groups,
            ),
        ).toEqual([]);
    });

    it("drops stale and duplicate selections", () => {
        expect(resolveSidebarFavoriteGroupKeys([groups[1].key, "friend:stale", groups[1].key], groups)).toEqual([groups[1].key]);
    });

    it("applies persisted keys before the deterministic fallback order", () => {
        expect(orderSidebarFavoriteGroups(groups, [groups[1].key]).map((group) => group.key)).toEqual([groups[1].key, groups[0].key]);
    });
});
