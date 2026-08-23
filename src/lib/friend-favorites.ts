export type FriendFavoriteRecord = {
    favoriteId: string;
    type: string;
    tags?: string[];
};

export function selectFavoriteFriendIds(remoteFavorites: FriendFavoriteRecord[], localFavoriteIds: string[], selectedGroups: string[]) {
    const selectedRemoteGroups = new Set(selectedGroups.filter((key) => key.startsWith("friend:")));
    const includeEveryRemoteGroup = selectedRemoteGroups.size === 0;
    const ids = new Set(localFavoriteIds);

    for (const favorite of remoteFavorites) {
        if (favorite.type !== "friend") continue;
        const groupKey = favorite.tags?.[0] ? `friend:${favorite.tags[0]}` : "";
        if (includeEveryRemoteGroup || selectedRemoteGroups.has(groupKey)) ids.add(favorite.favoriteId);
    }

    return [...ids];
}
