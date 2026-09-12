export type SidebarFavoriteGroup = {
    key: string;
    displayName: string;
    local: boolean;
    friendIds: string[];
};

export function resolveSidebarFavoriteGroupKeys(stored: string[], groups: SidebarFavoriteGroup[]) {
    const known = new Set(groups.map((group) => group.key));
    if (!stored.length) return groups.map((group) => group.key);
    return stored.filter((key, index) => known.has(key) && stored.indexOf(key) === index);
}

export function normalizeSidebarFavoriteGroupKeys(selected: string[], groups: SidebarFavoriteGroup[]) {
    const known = new Set(groups.map((group) => group.key));
    const normalized = selected.filter((key, index) => known.has(key) && selected.indexOf(key) === index);
    return normalized.length === groups.length && groups.every((group) => normalized.includes(group.key)) ? [] : normalized;
}

export function orderSidebarFavoriteGroups(groups: SidebarFavoriteGroup[], order: string[]) {
    const indexes = new Map(order.map((key, index) => [key, index]));
    return groups.toSorted((left, right) => {
        const leftIndex = indexes.get(left.key);
        const rightIndex = indexes.get(right.key);
        if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
        if (leftIndex !== undefined) return -1;
        if (rightIndex !== undefined) return 1;
        return left.key.localeCompare(right.key);
    });
}
