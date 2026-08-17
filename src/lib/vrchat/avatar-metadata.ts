import { z } from "zod";

import type { VrchatAvatar } from "./types";

export const avatarUpdateSchema = z
    .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().min(1).max(256).optional(),
        releaseStatus: z.enum(["private", "public"]).optional(),
    })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined));

export type AvatarUpdate = z.infer<typeof avatarUpdateSchema>;

export function avatarOwnershipError(avatar: VrchatAvatar, avatarId: string, ownerId: string, operation: "delete" | "update"): string | null {
    if (avatar.id !== avatarId || avatar.authorId !== ownerId) return `Only the avatar author can ${operation} it.`;
    return null;
}
