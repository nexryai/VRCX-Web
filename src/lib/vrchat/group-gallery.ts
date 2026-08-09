import { type VrchatGroupGalleryImage, vrchatGroupGalleryImageSchema } from "./types";

export function parseGroupGalleryPage(payload: unknown, groupId: string, galleryId: string) {
    const images = vrchatGroupGalleryImageSchema.array().parse(payload);
    if (images.some((image) => image.groupId !== groupId || image.galleryId !== galleryId)) throw new Error("The group gallery response did not match the requested gallery.");
    return images;
}

export function uniqueGroupGalleryImages(images: VrchatGroupGalleryImage[]) {
    return Array.from(new Map(images.map((image) => [image.id, image])).values());
}
