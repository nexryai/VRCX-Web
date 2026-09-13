import { describe, expect, it } from "vitest";

import { invertedProfileThemeColor, publicProfileBackgroundStyle, readableProfileThemeColor } from "./public-profile-appearance";

describe("VRCX public profile appearance", () => {
    it("preserves readable colors and nudges extreme colors toward contrast", () => {
        expect(readableProfileThemeColor("#38bdf8", "fallback", true)).toBe("#38bdf8");
        expect(readableProfileThemeColor("000000", "fallback", true)).not.toBe("#000000");
        expect(readableProfileThemeColor("ffffff", "fallback", false)).not.toBe("#ffffff");
        expect(readableProfileThemeColor("invalid", "fallback", true)).toBe("fallback");
        expect(invertedProfileThemeColor("#0ea5e9")).toBe("#f15a16");
        expect(invertedProfileThemeColor("var(--primary)")).toBe("var(--primary)");
    });

    it("builds allowlisted gradient and texture backgrounds with VRCX opacity semantics", () => {
        const gradient = publicProfileBackgroundStyle({ id: "usr_one", backgroundType: "gradient", backgroundGradientTop: "112233", backgroundGradientBottom: "445566" }, 0.5, true);
        expect(gradient.backgroundImage).toContain("rgba(0, 0, 0, 0.5)");
        expect(gradient.backgroundImage).toContain("linear-gradient(180deg");
        const texture = publicProfileBackgroundStyle({ id: "usr_one", backgroundType: "texture", backgroundTextureId: "grid" }, 1, false);
        expect(texture.backgroundImage).toContain("BG_Grid.png");
        expect(publicProfileBackgroundStyle({ id: "usr_one", backgroundType: "texture", backgroundTextureId: "unknown" }, 1, true).backgroundImage).toBeUndefined();
    });
});
