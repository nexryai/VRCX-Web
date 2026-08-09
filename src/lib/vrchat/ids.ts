import { z } from "zod";

export const VRCHAT_UUID_PATTERN_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function idPattern(prefix: string) {
    return new RegExp(`^${prefix}_${VRCHAT_UUID_PATTERN_SOURCE}$`, "i");
}

export const avatarIdPattern = idPattern("avtr");
export const groupIdPattern = idPattern("grp");
export const groupGalleryIdPattern = idPattern("ggal");
export const groupGalleryImageIdPattern = idPattern("ggim");
export const userIdPattern = idPattern("usr");
export const worldIdPattern = idPattern("wrld");
export const localFavoriteGroupIdPattern = idPattern("lfg");

export const avatarIdSchema = z.string().regex(avatarIdPattern);
export const groupIdSchema = z.string().regex(groupIdPattern);
export const groupGalleryIdSchema = z.string().regex(groupGalleryIdPattern);
export const groupGalleryImageIdSchema = z.string().regex(groupGalleryImageIdPattern);
export const userIdSchema = z.string().regex(userIdPattern);
export const worldIdSchema = z.string().regex(worldIdPattern);
export const localFavoriteGroupIdSchema = z.string().regex(localFavoriteGroupIdPattern);
export const favoriteObjectIdSchema = z.union([avatarIdSchema, userIdSchema, worldIdSchema]);
export const calendarEventIdSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9_-]+$/i);

export function isVrchatId(value: string): boolean {
    return avatarIdPattern.test(value) || groupIdPattern.test(value) || userIdPattern.test(value) || worldIdPattern.test(value);
}
