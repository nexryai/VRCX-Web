import { describe, expect, it } from "vitest";

import { latestVrchatFileUrl, validatePersonalGalleryFiles } from "./gallery-files";

const ownerId = "usr_00000000-0000-0000-0000-000000000001";
const file = {
    id: "file_00000000-0000-0000-0000-000000000002",
    ownerId,
    name: "Gallery image",
    extension: ".png",
    mimeType: "image/png",
    tags: ["gallery"],
    versions: [
        {
            version: 1,
            status: "complete" as const,
            created_at: "2026-08-09T23:00:00.000Z",
            file: { category: "simple" as const, fileName: "gallery.png", sizeInBytes: 120, status: "complete" as const, uploadId: "", url: "https://api.vrchat.cloud/api/1/file/file_00000000-0000-0000-0000-000000000002/1/file" },
        },
    ],
};

describe("personal VRChat gallery files", () => {
    it("validates owner/tag scope and resolves the latest complete version", () => {
        const [parsed] = validatePersonalGalleryFiles([file], ownerId);
        expect(latestVrchatFileUrl(parsed)).toBe(file.versions[0].file.url);
        expect(() => validatePersonalGalleryFiles([{ ...file, ownerId: "usr_00000000-0000-0000-0000-000000000003" }], ownerId)).toThrow();
        expect(() => validatePersonalGalleryFiles([{ ...file, tags: ["icon"] }], ownerId)).toThrow();
    });

    it("does not expose unfinished or deleted latest versions", () => {
        expect(latestVrchatFileUrl({ ...file, versions: [{ ...file.versions[0], deleted: true }] })).toBe("");
        expect(latestVrchatFileUrl({ ...file, versions: [{ ...file.versions[0], status: "waiting" }] })).toBe("");
    });
});
