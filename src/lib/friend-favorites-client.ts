export async function loadFavoriteFriendIds(signal?: AbortSignal) {
    const response = await fetch("/api/friend-favorites", { cache: "no-store", signal });
    const payload = (await response.json()) as { error?: string; favoriteIds?: string[] };
    if (!response.ok || !payload.favoriteIds) throw new Error(payload.error || "Favorite friends could not be loaded.");
    return new Set(payload.favoriteIds);
}
