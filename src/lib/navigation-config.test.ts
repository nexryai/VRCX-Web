import { describe, expect, it } from "vitest";

import { collectNavigationKeys, defaultNavigationConfig, sanitizeNavigationConfig } from "./navigation-config";

describe("navigation config", () => {
    it("deduplicates entries, drops invalid data, and appends eligible missing routes", () => {
        const config = sanitizeNavigationConfig({
            layout: [
                { type: "item", key: "feed" },
                { type: "folder", id: "favorites", name: "Mine", icon: "invalid", items: ["feed", "favorite-worlds"] },
            ],
            hiddenKeys: ["search", "search"],
        });
        expect(config.hiddenKeys).toEqual(["search"]);
        expect(config.layout[1]).toEqual({ type: "folder", id: "favorites", name: "Mine", icon: "ri-folder-line", items: ["favorite-worlds"] });
        expect(collectNavigationKeys(config.layout).has("search")).toBe(false);
        expect(collectNavigationKeys(config.layout).has("tools")).toBe(true);
    });

    it("does not append optional tool shortcuts", () => {
        expect([...collectNavigationKeys(sanitizeNavigationConfig(defaultNavigationConfig).layout)].some((key) => key.startsWith("tool-"))).toBe(false);
    });
});
