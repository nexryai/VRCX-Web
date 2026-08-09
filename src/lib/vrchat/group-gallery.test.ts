import { describe, expect, it } from "vitest";

import { parseGroupGalleryPage, uniqueGroupGalleryImages } from "./group-gallery";
import { vrchatGroupGalleryImageSchema, vrchatGroupGallerySchema, vrchatGroupSchema } from "./types";

const uuid = "00000000-0000-0000-0000-000000000001";

describe("VRChat group gallery contracts", () => {
    it("validates and defaults every field rendered by the Photos tab", () => {
        const gallery = vrchatGroupGallerySchema.parse({ id: `ggal_${uuid}`, name: "Photos" });
        expect(gallery).toMatchObject({ id: `ggal_${uuid}`, name: "Photos", description: "", membersOnly: false });

        expect(
            vrchatGroupSchema.parse({
                id: `grp_${uuid}`,
                name: "Gallery Group",
                galleries: [{ id: `ggal_${uuid}`, name: "Photos", membersOnly: true, roleIdsToView: null }],
            }).galleries,
        ).toEqual([expect.objectContaining({ id: `ggal_${uuid}`, membersOnly: true, roleIdsToView: null })]);
    });

    it("requires canonical ownership IDs and an absolute image URL", () => {
        const image = {
            id: `ggim_${uuid}`,
            groupId: `grp_${uuid}`,
            galleryId: `ggal_${uuid}`,
            imageUrl: `https://api.vrchat.cloud/api/1/file/file_${uuid}/1/file`,
        };
        expect(vrchatGroupGalleryImageSchema.parse(image)).toEqual(image);
        expect(vrchatGroupGalleryImageSchema.safeParse({ ...image, galleryId: "ggal_invalid" }).success).toBe(false);
        expect(vrchatGroupGalleryImageSchema.safeParse({ ...image, imageUrl: "/relative" }).success).toBe(false);
    });

    it("rejects cross-gallery payloads and deduplicates paged retries", () => {
        const image = {
            id: `ggim_${uuid}`,
            groupId: `grp_${uuid}`,
            galleryId: `ggal_${uuid}`,
            imageUrl: `https://files.vrchat.cloud/file/file_${uuid}/1/file`,
        };
        expect(parseGroupGalleryPage([image], image.groupId, image.galleryId)).toEqual([image]);
        expect(() => parseGroupGalleryPage([{ ...image, galleryId: "ggal_00000000-0000-0000-0000-000000000002" }], image.groupId, image.galleryId)).toThrow("did not match");
        expect(uniqueGroupGalleryImages([image, { ...image, approved: true }])).toEqual([{ ...image, approved: true }]);
    });
});
