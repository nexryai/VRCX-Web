import { describe, expect, it } from "vitest";

import { uploadedAvatarImageUrl, uploadedEntityImageUrl } from "./avatar-image";
import type { VrchatFile } from "./types";

const file: VrchatFile = {
    id: "file_00000000-0000-0000-0000-000000000001",
    ownerId: "usr_00000000-0000-0000-0000-000000000001",
    name: "Avatar image",
    extension: ".png",
    mimeType: "image/png",
    tags: ["avatarimage"],
    versions: [{ version: 1, status: "complete", file: { category: "simple", fileName: "avatar.png", sizeInBytes: 123, status: "complete", uploadId: "upload", url: "https://files.vrchat.cloud/avatar.png" } }],
};

describe("uploadedAvatarImageUrl", () => {
    it("accepts the active owner's complete avatarimage upload", () => {
        expect(uploadedAvatarImageUrl(file, file.ownerId)).toBe("https://files.vrchat.cloud/avatar.png");
    });

    it("rejects another owner, another tag, and an incomplete latest version", () => {
        expect(uploadedAvatarImageUrl(file, "usr_00000000-0000-0000-0000-000000000002")).toBe("");
        expect(uploadedAvatarImageUrl({ ...file, tags: ["gallery"] }, file.ownerId)).toBe("");
        expect(uploadedAvatarImageUrl({ ...file, versions: [...file.versions, { version: 2, status: "waiting" }] }, file.ownerId)).toBe("");
    });

    it("accepts only the fixed worldimage tag for world uploads", () => {
        expect(uploadedEntityImageUrl({ ...file, tags: ["worldimage"] }, file.ownerId, "worldimage")).toBe("https://files.vrchat.cloud/avatar.png");
        expect(uploadedEntityImageUrl(file, file.ownerId, "worldimage")).toBe("");
    });
});
