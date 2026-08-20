import { latestVrchatFileUrl } from "./gallery-files";
import type { VrchatFile } from "./types";

export function uploadedAvatarImageUrl(file: VrchatFile, ownerId: string) {
    if (file.ownerId !== ownerId || !file.tags.includes("avatarimage")) return "";
    return latestVrchatFileUrl(file);
}
