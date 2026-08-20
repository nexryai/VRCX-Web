import { describe, expect, it } from "vitest";

import { buildWorldUpstreamUpdate, normalizeYoutubePreview, worldOwnershipError, worldUpdateSchema } from "./world-metadata";

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
});
