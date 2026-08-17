import { z } from "zod";

import { type VrchatFile, vrchatFileSchema } from "./types";

const avatarGalleryFilesSchema = z.array(vrchatFileSchema).max(100);

export function validateAvatarGalleryFiles(value: unknown, authorId: string): VrchatFile[] {
    const files = avatarGalleryFilesSchema.parse(value);
    if (files.some((file) => file.ownerId !== authorId || !file.tags.includes("avatargallery"))) throw new Error("The avatar gallery response did not match its author or tag.");
    return files;
}

export function latestAvatarGalleryImageUrl(file: VrchatFile) {
    const version = file.versions.at(-1);
    return version && !version.deleted && version.status === "complete" && version.file?.status === "complete" ? version.file.url : "";
}
