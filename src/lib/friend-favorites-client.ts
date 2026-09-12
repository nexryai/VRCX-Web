import type { SidebarFavoriteGroup } from "./sidebar-favorite-groups";

export async function loadFavoriteFriendIds(signal?: AbortSignal) {
    const response = await fetch("/api/friend-favorites", { cache: "no-store", signal });
    const payload = (await response.json()) as { error?: string; favoriteIds?: string[] };
    if (!response.ok || !payload.favoriteIds) throw new Error(payload.error || "Favorite friends could not be loaded.");
    return new Set(payload.favoriteIds);
}

export async function loadSidebarFavoriteFriendGroups(signal?: AbortSignal) {
    const response = await fetch("/api/friend-favorites?scope=sidebar", { cache: "no-store", signal });
    const payload = (await response.json()) as { error?: string; groups?: SidebarFavoriteGroup[] };
    if (!response.ok || !payload.groups) throw new Error(payload.error || "Favorite friend groups could not be loaded.");
    return payload.groups;
}
