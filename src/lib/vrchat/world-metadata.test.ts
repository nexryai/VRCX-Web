import { describe, expect, it } from "vitest";

import { buildWorldUpstreamUpdate, normalizeYoutubePreview, worldOwnershipError, worldTagSettingsFromWorld, worldUpdateSchema } from "./world-metadata";

const ownerId = "usr_00000000-0000-0000-0000-000000000001";
const worldId = "wrld_00000000-0000-0000-0000-000000000010";
const world = { id: worldId, name: "Owned World", authorId: ownerId, capacity: 40, recommendedCapacity: 20 };

describe("World metadata mutation policy", () => {
    it("accepts exactly one maintained field and rejects privileged or malformed input", () => {
        expect(worldUpdateSchema.safeParse({ name: "Renamed World" }).success).toBe(true);
        expect(worldUpdateSchema.safeParse({ capacity: 40 }).success).toBe(true);
        expect(worldUpdateSchema.safeParse({ previewYoutubeId: "dQw4w9WgXcQ" }).success).toBe(true);
        expect(worldUpdateSchema.safeParse({}).success).toBe(false);
        expect(worldUpdateSchema.safeParse({ name: "A", capacity: 10 }).success).toBe(false);
        expect(worldUpdateSchema.safeParse({ authorId: ownerId }).success).toBe(false);
        expect(worldUpdateSchema.safeParse({ capacity: 81 }).success).toBe(false);
    });

    it("keeps recommended capacity within the resulting world capacity", () => {
        expect(buildWorldUpstreamUpdate(world, { capacity: 30 }).optimistic.capacity).toBe(30);
        expect(() => buildWorldUpstreamUpdate(world, { capacity: 10 })).toThrow("cannot exceed");
        expect(() => buildWorldUpstreamUpdate(world, { recommendedCapacity: 41 })).toThrow("cannot exceed");
    });

    it("normalizes VRCX's accepted YouTube ID and URL forms", () => {
        expect(normalizeYoutubePreview("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
        expect(normalizeYoutubePreview("abc123")).toBe("abc123");
        expect(normalizeYoutubePreview("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
        expect(normalizeYoutubePreview("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
        expect(normalizeYoutubePreview("")).toBeNull();
        expect(normalizeYoutubePreview("not a video")).toBeNull();
    });

    it("requires the authoritative world ID and author", () => {
        expect(worldOwnershipError(world, worldId, ownerId)).toBeNull();
        expect(worldOwnershipError(world, "wrld_00000000-0000-0000-0000-000000000099", ownerId)).toContain("author");
        expect(worldOwnershipError(world, worldId, "usr_00000000-0000-0000-0000-000000000002")).toContain("author");
    });

    it("translates VRCX world tag controls without trusting raw protected tags", () => {
        const current = {
            ...world,
            tags: ["system_approved", "author_tag_old", "content_horror", "content_custom", "feature_emoji_disabled"],
            disabledPropAbilities: ["player_movement", "future_ability"],
        };
        const settings = worldTagSettingsFromWorld(current);
        expect(settings).toMatchObject({ authorTags: ["old"], contentHorror: true, emoji: false, propMovement: false });
        const mutation = buildWorldUpstreamUpdate(current, { tagSettings: { ...settings, authorTags: ["new"], contentHorror: false, stickers: false, propMovement: true } });
        expect(mutation.upstream).toEqual({
            tags: ["content_custom", "author_tag_new", "feature_emoji_disabled", "feature_stickers_disabled"],
            disabledPropAbilities: ["future_ability"],
        });
        expect(mutation.optimistic.tags).toContain("system_approved");
    });

    it("accepts a unique bounded domain list as one update and rejects mixed mutations", () => {
        expect(worldUpdateSchema.safeParse({ urlList: ["example.com", "media.example.com"] }).success).toBe(true);
        expect(worldUpdateSchema.safeParse({ urlList: ["example.com", "example.com"] }).success).toBe(false);
        expect(worldUpdateSchema.safeParse({ urlList: [""] }).success).toBe(false);
        expect(worldUpdateSchema.safeParse({ urlList: ["example.com"], name: "Mixed" }).success).toBe(false);
    });
});
