import { z } from "zod";

import { type VrchatFile, vrchatFileSchema } from "./types";

export const vrchatFileListSchema = z.array(vrchatFileSchema).max(100);

export function validatePersonalGalleryFiles(value: unknown, ownerId: string): VrchatFile[] {
    const files = vrchatFileListSchema.parse(value);
    if (files.some((file) => file.ownerId !== ownerId || !file.tags.includes("gallery"))) throw new Error("The gallery file response did not match its owner or tag.");
    return files;
}

export function latestVrchatFileUrl(file: VrchatFile) {
    const version = file.versions.at(-1);
    return version && !version.deleted && version.status === "complete" && version.file?.status === "complete" ? version.file.url : "";
}
