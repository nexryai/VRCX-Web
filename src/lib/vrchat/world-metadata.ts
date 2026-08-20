import { z } from "zod";

import type { VrchatWorld } from "./types";

export const worldUpdateSchema = z
    .object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().min(1).max(1_024).optional(),
        capacity: z.number().int().min(0).max(80).optional(),
        recommendedCapacity: z.number().int().min(0).max(80).optional(),
        previewYoutubeId: z
            .string()
            .trim()
            .min(1)
            .max(11)
            .regex(/^[A-Za-z0-9_-]*$/)
            .optional(),
    })
    .strict()
    .refine((body) => Object.values(body).filter((value) => value !== undefined).length === 1);

export type WorldUpdate = z.infer<typeof worldUpdateSchema>;

export function buildWorldUpstreamUpdate(current: VrchatWorld, update: WorldUpdate) {
    const capacity = update.capacity ?? current.capacity;
    const recommendedCapacity = update.recommendedCapacity ?? current.recommendedCapacity;
    if (capacity !== undefined && recommendedCapacity !== undefined && recommendedCapacity > capacity) throw new Error("Recommended capacity cannot exceed capacity.");
    return { upstream: { ...update }, optimistic: { ...current, ...update } };
}

export function worldOwnershipError(world: VrchatWorld, worldId: string, ownerId: string) {
    return world.id === worldId && world.authorId === ownerId ? null : "Only the world author can update it.";
}

export function normalizeYoutubePreview(value: string) {
    const trimmed = value.trim();
    if (/^[A-Za-z0-9_-]{1,11}$/.test(trimmed)) return trimmed;
    try {
        const url = new URL(trimmed);
        const candidate = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || "";
        return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
    } catch {
        return null;
    }
}
