import { describe, expect, it } from "vitest";

import { vrchatCosmeticIconFrameSchema, vrchatPublicProfileSchema, vrchatUserSchema } from "./types";

describe("VRChat icon-frame decoding", () => {
    it("keeps only typed frame fields needed by the VRCX renderer", () => {
        const frame = {
            id: "icon-frame-one",
            metadata: {
                assets: [
                    { type: "introAnimation", url: "https://assets.vrchat.com/intro.webp", totalDurationMs: 1_500 },
                    { type: "mainAnimation", url: "https://assets.vrchat.com/main.webp" },
                ],
            },
        };
        expect(vrchatCosmeticIconFrameSchema.parse(frame)).toEqual(frame);
        expect(vrchatUserSchema.parse({ id: "usr_one", displayName: "Framed User", iconFrame: frame.id })).toMatchObject({ iconFrame: frame.id });
    });

    it("validates public profile appearance fields", () => {
        expect(vrchatPublicProfileSchema.safeParse({ id: "usr_one", backgroundType: "gradient", backgroundGradientTop: "112233", themeIconColor: "#abcdef" }).success).toBe(true);
        expect(vrchatPublicProfileSchema.safeParse({ id: "usr_one", backgroundType: "gradient", themeIconColor: "red" }).success).toBe(false);
        expect(vrchatPublicProfileSchema.safeParse({ id: "usr_one", backgroundType: "javascript" }).success).toBe(false);
    });

    it("rejects unsafe asset URLs and unreasonable intro durations", () => {
        expect(vrchatCosmeticIconFrameSchema.safeParse({ id: "bad-url", metadata: { assets: [{ type: "mainAnimation", url: "/relative.webp" }] } }).success).toBe(false);
        expect(vrchatCosmeticIconFrameSchema.safeParse({ id: "bad-duration", metadata: { assets: [{ type: "introAnimation", url: "https://assets.vrchat.com/intro.webp", totalDurationMs: 60_001 }] } }).success).toBe(false);
    });
});
