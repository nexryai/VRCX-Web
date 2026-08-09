export type ParsedLocation = {
    location: string;
    worldId?: string;
    instanceId?: string;
    groupId?: string;
    creatorId?: string;
};

const WORLD_ID_PATTERN = /^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_TAG_PATTERN = /(?:^|~)group\((grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i;
const CREATOR_TAG_PATTERN = /(?:^|~)(?:friends|hidden|private)\((usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i;

/**
 * VRChat uses sentinel values such as offline/private/traveling alongside
 * world-instance tags. Only a complete world tag is an observable session.
 */
export function parseObservableLocation(value: unknown): ParsedLocation | null {
    if (typeof value !== "string" || !value) return null;
    const [worldId, instanceAndTags] = value.split(":", 2);
    if (!WORLD_ID_PATTERN.test(worldId) || !instanceAndTags) return null;

    const [instanceId] = instanceAndTags.split("~", 1);
    if (!instanceId) return null;
    const groupId = value.match(GROUP_TAG_PATTERN)?.[1];
    const creatorId = value.match(CREATOR_TAG_PATTERN)?.[1];
    return {
        location: value,
        worldId,
        instanceId,
        ...(groupId ? { groupId } : {}),
        ...(creatorId ? { creatorId } : {}),
    };
}

export function unobservableReason(value: unknown): "offline" | "private" | "unobservable" {
    if (value === "offline" || value == null || value === "") return "offline";
    if (value === "private") return "private";
    return "unobservable";
}
