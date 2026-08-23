import { latestVrchatFileUrl } from "./gallery-files";
import type { VrchatFile } from "./types";

export function uploadedAvatarImageUrl(file: VrchatFile, ownerId: string) {
    return uploadedEntityImageUrl(file, ownerId, "avatarimage");
}

export function uploadedEntityImageUrl(file: VrchatFile, ownerId: string, tag: "avatarimage" | "worldimage") {
    if (file.ownerId !== ownerId || !file.tags.includes(tag)) return "";
    return latestVrchatFileUrl(file);
}
