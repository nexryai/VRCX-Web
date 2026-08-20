import { z } from "zod";

import type { VrchatWorld } from "./types";

export const worldTagSettingsSchema = z
    .object({
        authorTags: z.array(z.string().trim().min(1).max(64)).max(20),
        avatarScalingDisabled: z.boolean(),
        focusViewDisabled: z.boolean(),
        debugAllowed: z.boolean(),
        contentHorror: z.boolean(),
        contentGore: z.boolean(),
        contentViolence: z.boolean(),
        contentAdult: z.boolean(),
        contentSex: z.boolean(),
        emoji: z.boolean(),
        stickers: z.boolean(),
        pedestals: z.boolean(),
        prints: z.boolean(),
        drones: z.boolean(),
        props: z.boolean(),
        thirdPerson: z.boolean(),
        propMovement: z.boolean(),
    })
    .strict();

export type WorldTagSettings = z.infer<typeof worldTagSettingsSchema>;

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
        tagSettings: worldTagSettingsSchema.optional(),
        urlList: z
            .array(z.string().trim().min(1).max(253))
            .max(100)
            .refine((domains) => new Set(domains).size === domains.length)
            .optional(),
    })
    .strict()
    .refine((body) => Object.values(body).filter((value) => value !== undefined).length === 1);

export type WorldUpdate = z.infer<typeof worldUpdateSchema>;

export function buildWorldUpstreamUpdate(current: VrchatWorld, update: WorldUpdate) {
    if (update.tagSettings) {
        const tags = buildWorldTags(current.tags || [], update.tagSettings);
        const protectedTags = (current.tags || []).filter((tag) => !isEditableWorldTag(tag));
        const disabledPropAbilities = (current.disabledPropAbilities || []).filter((ability) => ability !== "player_movement");
        if (!update.tagSettings.propMovement) disabledPropAbilities.unshift("player_movement");
        return { upstream: { tags, disabledPropAbilities }, optimistic: { ...current, tags: [...protectedTags, ...tags], disabledPropAbilities } };
    }
    const capacity = update.capacity ?? current.capacity;
    const recommendedCapacity = update.recommendedCapacity ?? current.recommendedCapacity;
    if (capacity !== undefined && recommendedCapacity !== undefined && recommendedCapacity > capacity) throw new Error("Recommended capacity cannot exceed capacity.");
    return { upstream: { ...update }, optimistic: { ...current, ...update } };
}

export function worldTagSettingsFromWorld(world: Pick<VrchatWorld, "disabledPropAbilities" | "tags">): WorldTagSettings {
    const tags = new Set(world.tags || []);
    return {
        authorTags: (world.tags || []).filter((tag) => tag.startsWith("author_tag_")).map((tag) => tag.slice(11)),
        avatarScalingDisabled: tags.has("feature_avatar_scaling_disabled"),
        focusViewDisabled: tags.has("feature_focus_view_disabled"),
        debugAllowed: tags.has("debug_allowed"),
        contentHorror: tags.has("content_horror"),
        contentGore: tags.has("content_gore"),
        contentViolence: tags.has("content_violence"),
        contentAdult: tags.has("content_adult"),
        contentSex: tags.has("content_sex"),
        emoji: !tags.has("feature_emoji_disabled"),
        stickers: !tags.has("feature_stickers_disabled"),
        pedestals: !tags.has("feature_pedestals_disabled"),
        prints: !tags.has("feature_prints_disabled"),
        drones: !tags.has("feature_drones_disabled"),
        props: !tags.has("feature_props_disabled"),
        thirdPerson: !tags.has("feature_third_person_view_disabled"),
        propMovement: !(world.disabledPropAbilities || []).includes("player_movement"),
    };
}

function buildWorldTags(currentTags: string[], settings: WorldTagSettings) {
    const selected = new Set<string>();
    for (const tag of currentTags) {
        if (tag.startsWith("content_") && !EDITABLE_CONTENT_TAGS.includes(tag)) selected.add(tag);
    }
    for (const tag of settings.authorTags) selected.add(`author_tag_${tag}`);
    for (const [field, tag] of WORLD_TAG_SWITCHES) {
        if (settings[field]) selected.add(tag);
    }
    for (const [field, tag] of WORLD_ENABLED_FEATURE_SWITCHES) {
        if (!settings[field]) selected.add(tag);
    }
    return [...selected];
}

function isEditableWorldTag(tag: string) {
    return tag.startsWith("author_tag_") || tag.startsWith("content_") || tag === "debug_allowed" || tag === "feature_avatar_scaling_disabled" || tag === "feature_focus_view_disabled" || WORLD_ENABLED_FEATURE_SWITCHES.some(([, featureTag]) => tag === featureTag);
}

const EDITABLE_CONTENT_TAGS = ["content_horror", "content_gore", "content_violence", "content_adult", "content_sex"];
const WORLD_TAG_SWITCHES = [
    ["avatarScalingDisabled", "feature_avatar_scaling_disabled"],
    ["focusViewDisabled", "feature_focus_view_disabled"],
    ["debugAllowed", "debug_allowed"],
    ["contentHorror", "content_horror"],
    ["contentGore", "content_gore"],
    ["contentViolence", "content_violence"],
    ["contentAdult", "content_adult"],
    ["contentSex", "content_sex"],
] as const satisfies ReadonlyArray<readonly [keyof WorldTagSettings, string]>;
const WORLD_ENABLED_FEATURE_SWITCHES = [
    ["emoji", "feature_emoji_disabled"],
    ["stickers", "feature_stickers_disabled"],
    ["pedestals", "feature_pedestals_disabled"],
    ["prints", "feature_prints_disabled"],
    ["drones", "feature_drones_disabled"],
    ["props", "feature_props_disabled"],
    ["thirdPerson", "feature_third_person_view_disabled"],
] as const satisfies ReadonlyArray<readonly [keyof WorldTagSettings, string]>;

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
