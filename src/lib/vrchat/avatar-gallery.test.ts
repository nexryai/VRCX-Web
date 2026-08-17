import { describe, expect, it } from "vitest";

import { latestAvatarGalleryImageUrl, validateAvatarGalleryFiles } from "./avatar-gallery";
import { type VrchatFile, vrchatAvatarSchema } from "./types";

const authorId = "usr_00000000-0000-0000-0000-000000000001";
const file: VrchatFile = {
    id: "file_00000000-0000-0000-0000-000000000010",
    ownerId: authorId,
    name: "Gallery",
    extension: ".png",
    mimeType: "image/png",
    tags: ["avatargallery"],
    versions: [{ version: 1, status: "complete", file: { category: "simple", fileName: "gallery.png", sizeInBytes: 123, status: "complete", uploadId: "upload", url: "https://files.vrchat.cloud/gallery.png" } }],
};

describe("VRChat avatar gallery parsing", () => {
    it("accepts only the requested author's avatar-gallery files", () => {
        expect(validateAvatarGalleryFiles([file], authorId)).toHaveLength(1);
        expect(() => validateAvatarGalleryFiles([{ ...file, ownerId: "usr_00000000-0000-0000-0000-000000000002" }], authorId)).toThrow();
        expect(() => validateAvatarGalleryFiles([{ ...file, tags: ["gallery"] }], authorId)).toThrow();
    });

    it("renders only a complete latest file version", () => {
        expect(latestAvatarGalleryImageUrl(file)).toBe("https://files.vrchat.cloud/gallery.png");
        expect(latestAvatarGalleryImageUrl({ ...file, versions: [...file.versions, { version: 2, status: "queued" }] })).toBe("");
    });

    it("validates the listing fields rendered by Avatar Dialog", () => {
        expect(
            vrchatAvatarSchema.parse({
                id: "avtr_00000000-0000-0000-0000-000000000010",
                name: "Listed Avatar",
                publishedListings: [{ listingId: "prod_listing", displayName: "Avatar Access", description: "One-time access", imageId: file.id, priceTokens: 1_200 }],
            }).publishedListings,
        ).toEqual([expect.objectContaining({ displayName: "Avatar Access", priceTokens: 1_200 })]);
    });
});
