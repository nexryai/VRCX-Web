import { z } from "zod";

export const navigationItemKeySchema = z.enum([
    "feed",
    "friends-locations",
    "game-log",
    "search",
    "favorite-friends",
    "favorite-worlds",
    "favorite-avatars",
    "friend-log",
    "friend-list",
    "moderation",
    "notification",
    "my-avatars",
    "charts-mutual",
    "charts-hot-worlds",
    "tools",
    "tool-group-calendar",
    "tool-discord-names",
    "tool-export-notes",
    "tool-export-friend-list",
    "tool-export-own-avatars",
]);

export type NavigationItemKey = z.infer<typeof navigationItemKeySchema>;
export type NavigationLayoutEntry = { type: "item"; key: NavigationItemKey } | { type: "folder"; id: string; name: string; icon: string; items: NavigationItemKey[] };
export type NavigationConfig = { layout: NavigationLayoutEntry[]; hiddenKeys: NavigationItemKey[] };

const itemSchema = z.object({ type: z.literal("item"), key: navigationItemKeySchema }).strict();
const folderSchema = z
    .object({
        type: z.literal("folder"),
        id: z.string().min(1).max(120),
        name: z.string().max(80),
        icon: z
            .string()
            .max(80)
            .regex(/^ri-[a-z0-9-]+$/),
        items: z.array(navigationItemKeySchema).max(30),
    })
    .strict();

export const navigationConfigSchema = z.object({ layout: z.array(z.discriminatedUnion("type", [itemSchema, folderSchema])).max(40), hiddenKeys: z.array(navigationItemKeySchema).max(30) }).strict();

export type NavigationDefinition = { key: NavigationItemKey; href: string; label: string; icon: string; tool?: string };

export const navigationDefinitions: NavigationDefinition[] = [
    { key: "feed", href: "/feed", label: "Feed", icon: "ri-rss-line" },
    { key: "friends-locations", href: "/friends-locations", label: "Friends Locations", icon: "ri-user-location-line" },
    { key: "game-log", href: "/game-log", label: "Game Log", icon: "ri-history-line" },
    { key: "search", href: "/search", label: "Search", icon: "ri-search-line" },
    { key: "favorite-friends", href: "/favorites/friends", label: "Favorite Friends", icon: "ri-user-heart-line" },
    { key: "favorite-worlds", href: "/favorites/worlds", label: "Favorite Worlds", icon: "ri-earth-line" },
    { key: "favorite-avatars", href: "/favorites/avatars", label: "Favorite Avatars", icon: "ri-empathize-line" },
    { key: "friend-log", href: "/social/friend-log", label: "Friend Log", icon: "ri-contacts-line" },
    { key: "friend-list", href: "/social/friend-list", label: "Friend List", icon: "ri-booklet-line" },
    { key: "moderation", href: "/social/moderation", label: "Moderation", icon: "ri-shield-user-line" },
    { key: "notification", href: "/notification", label: "Notifications", icon: "ri-notification-2-line" },
    { key: "my-avatars", href: "/my-avatars", label: "My Avatars", icon: "ri-contacts-book-3-line" },
    { key: "charts-mutual", href: "/charts/mutual", label: "Mutual Friends", icon: "ri-group-2-line" },
    { key: "charts-hot-worlds", href: "/charts/hot-worlds", label: "Hot Worlds", icon: "ri-fire-line" },
    { key: "tools", href: "/tools", label: "Tools", icon: "ri-tools-line" },
    { key: "tool-group-calendar", href: "/tools?tool=group-calendar", label: "Group Calendar", icon: "ri-calendar-event-line", tool: "group-calendar" },
    { key: "tool-discord-names", href: "/tools?tool=discord-names", label: "Discord Names", icon: "ri-discord-line", tool: "discord-names" },
    { key: "tool-export-notes", href: "/tools?tool=export-notes", label: "Export User Memos", icon: "ri-file-list-3-line", tool: "export-notes" },
    { key: "tool-export-friend-list", href: "/tools?tool=export-friend-list", label: "Export Friends List", icon: "ri-file-list-3-line", tool: "export-friend-list" },
    { key: "tool-export-own-avatars", href: "/tools?tool=export-own-avatars", label: "Export Own Avatars", icon: "ri-file-list-3-line", tool: "export-own-avatars" },
];

export const defaultNavigationConfig: NavigationConfig = {
    layout: [
        { type: "item", key: "feed" },
        { type: "item", key: "friends-locations" },
        { type: "item", key: "game-log" },
        { type: "item", key: "search" },
        { type: "folder", id: "default-folder-favorites", name: "Favorites", icon: "ri-star-line", items: ["favorite-friends", "favorite-worlds", "favorite-avatars"] },
        { type: "folder", id: "default-folder-social", name: "Social", icon: "ri-group-line", items: ["friend-log", "friend-list", "moderation"] },
        { type: "item", key: "notification" },
        { type: "item", key: "my-avatars" },
        { type: "folder", id: "default-folder-charts", name: "Charts", icon: "ri-pie-chart-line", items: ["charts-mutual", "charts-hot-worlds"] },
        { type: "item", key: "tools" },
    ],
    hiddenKeys: [],
};

const definitionKeys = new Set<NavigationItemKey>(navigationDefinitions.map((definition) => definition.key));

// Closely translates VRCX navMenuUtils.sanitizeLayout for the eligible web definition set.
export function sanitizeNavigationConfig(value?: Partial<NavigationConfig> | null): NavigationConfig {
    if (!value?.layout) value = defaultNavigationConfig;
    const used = new Set<NavigationItemKey>();
    const hiddenKeys = [...new Set((value?.hiddenKeys ?? []).filter((key) => definitionKeys.has(key)))];
    const hidden = new Set(hiddenKeys);
    const layout: NavigationLayoutEntry[] = [];
    for (const entry of value?.layout ?? []) {
        if (entry.type === "item") {
            if (definitionKeys.has(entry.key) && !used.has(entry.key)) {
                layout.push({ type: "item", key: entry.key });
                used.add(entry.key);
            }
            continue;
        }
        const items = entry.items.filter((key) => definitionKeys.has(key) && !used.has(key));
        for (const key of items) used.add(key);
        if (items.length) layout.push({ type: "folder", id: entry.id || crypto.randomUUID(), name: entry.name || "Folder name", icon: /^ri-[a-z0-9-]+$/.test(entry.icon) ? entry.icon : "ri-folder-line", items });
    }
    for (const definition of navigationDefinitions) {
        if (!definition.tool && !used.has(definition.key) && !hidden.has(definition.key)) layout.push({ type: "item", key: definition.key });
    }
    return { layout, hiddenKeys };
}

export function collectNavigationKeys(layout: NavigationLayoutEntry[]) {
    return new Set(layout.flatMap((entry) => (entry.type === "item" ? [entry.key] : entry.items)));
}
