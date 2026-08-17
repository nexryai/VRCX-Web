import { z } from "zod";

import type { VrchatAvatar } from "./types";

export const avatarActionSchema = z.object({ action: z.enum(["block", "delete-impostor", "enqueue-impostor", "regenerate-impostor", "select", "select-fallback", "unblock"]) }).strict();
export type AvatarAction = z.infer<typeof avatarActionSchema>["action"];

export function avatarActionTargetError(action: AvatarAction, avatar: VrchatAvatar, ownerId: string): string | null {
    if (action === "select-fallback" && !avatar.tags?.some((tag) => tag.includes("quest"))) return "This avatar is not tagged as a Quest fallback.";
    if ((action === "delete-impostor" || action === "enqueue-impostor" || action === "regenerate-impostor") && avatar.authorId !== ownerId) return "Only the avatar author can manage its impostor.";
    return null;
}
