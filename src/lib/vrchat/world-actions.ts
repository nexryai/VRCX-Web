import { z } from "zod";

import type { VrchatWorld } from "./types";

export const worldActionSchema = z.object({ action: z.enum(["delete", "publish", "unpublish"]) }).strict();
export type WorldAction = z.infer<typeof worldActionSchema>["action"];

export function worldActionOwnershipError(world: VrchatWorld, worldId: string, ownerId: string) {
    return world.id === worldId && world.authorId === ownerId ? null : "Only the world author can manage its publication or delete it.";
}

export function optimisticWorldAfterAction(world: VrchatWorld, action: Exclude<WorldAction, "delete">): VrchatWorld {
    if (action === "publish") return { ...world, releaseStatus: "public", tags: [...new Set([...(world.tags || []), "system_labs"])] };
    return { ...world, releaseStatus: "private", tags: (world.tags || []).filter((tag) => tag !== "system_approved" && tag !== "system_labs") };
}
