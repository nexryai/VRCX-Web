import { z } from "zod";

import type { VrchatAvatar, VrchatAvatarStyle } from "./types";

const editableTagSchema = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[^,\r\n]+$/);

export const avatarUpdateSchema = z
    .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().min(1).max(256).optional(),
        releaseStatus: z.enum(["private", "public"]).optional(),
        contentTags: z.array(editableTagSchema).max(32).optional(),
        authorTags: z.array(editableTagSchema).max(32).optional(),
        styles: z
            .object({ primary: z.string().trim().max(128), secondary: z.string().trim().max(128) })
            .strict()
            .optional(),
    })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined));

export type AvatarUpdate = z.infer<typeof avatarUpdateSchema>;

export function buildAvatarUpstreamUpdate(current: VrchatAvatar, update: AvatarUpdate, availableStyles: VrchatAvatarStyle[] = []) {
    const upstream: Record<string, unknown> = {};
    if (update.name !== undefined) upstream.name = update.name;
    if (update.description !== undefined) upstream.description = update.description;
    if (update.releaseStatus !== undefined) upstream.releaseStatus = update.releaseStatus;

    let tags = [...(current.tags || [])];
    if (update.contentTags !== undefined) tags = replaceTagNamespace(tags, "content_", update.contentTags);
    if (update.authorTags !== undefined) tags = replaceTagNamespace(tags, "author_tag_", update.authorTags);
    if (update.contentTags !== undefined || update.authorTags !== undefined) upstream.tags = tags;

    if (update.styles !== undefined) {
        const styleIds = new Map(availableStyles.map((style) => [style.styleName, style.id]));
        const primaryStyle = update.styles.primary ? styleIds.get(update.styles.primary) : "";
        const secondaryStyle = update.styles.secondary ? styleIds.get(update.styles.secondary) : "";
        if (primaryStyle === undefined || secondaryStyle === undefined) throw new Error("The selected avatar style is unavailable.");
        upstream.primaryStyle = primaryStyle;
        upstream.secondaryStyle = secondaryStyle;
    }

    const optimistic: VrchatAvatar = {
        ...current,
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.description !== undefined ? { description: update.description } : {}),
        ...(update.releaseStatus !== undefined ? { releaseStatus: update.releaseStatus } : {}),
        ...(upstream.tags ? { tags } : {}),
        ...(update.styles !== undefined ? { styles: update.styles } : {}),
    };
    return { optimistic, upstream };
}

function replaceTagNamespace(existing: string[], prefix: string, values: string[]) {
    const tags = existing.filter((tag) => !tag.startsWith(prefix));
    for (const value of values) {
        const tag = `${prefix}${value.trim()}`;
        if (!tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

export function avatarOwnershipError(avatar: VrchatAvatar, avatarId: string, ownerId: string, operation: "delete" | "update"): string | null {
    if (avatar.id !== avatarId || avatar.authorId !== ownerId) return `Only the avatar author can ${operation} it.`;
    return null;
}
