import "server-only";

import { serializeAppSettings } from "@/lib/app-settings";
import { selectFavoriteFriendIds } from "@/lib/friend-favorites";
import type { SidebarFavoriteGroup } from "@/lib/sidebar-favorite-groups";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function listSelectedFavoriteFriendIds(ownerId: string) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const [settings, remoteFavorites, localFavorites] = await Promise.all([c.appSettings.findOne({ _id: "singleton" }), c.favorites.find({ ownerId, active: true, favoriteType: "friend" }).toArray(), c.localFavorites.find({ ownerId, kind: "friend" }, { projection: { objectId: 1 } }).toArray()]);

    return selectFavoriteFriendIds(
        remoteFavorites.map((document) => document.favorite),
        localFavorites.map((document) => document.objectId),
        serializeAppSettings(settings).localFavoriteFriendsGroups ?? [],
    );
}

export async function listSidebarFavoriteFriendGroups(ownerId: string): Promise<SidebarFavoriteGroup[]> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const [remoteGroups, remoteFavorites, localGroups, localFavorites] = await Promise.all([
        c.favoriteGroups.find({ ownerId, active: true, "group.type": "friend" }).sort({ "group.name": 1 }).toArray(),
        c.favorites.find({ ownerId, active: true, favoriteType: "friend" }).toArray(),
        c.localFavoriteGroups.find({ ownerId, kind: "friend" }).sort({ createdAt: 1 }).toArray(),
        c.localFavorites.find({ ownerId, kind: "friend" }, { projection: { groupId: 1, objectId: 1 } }).toArray(),
    ]);
    const remoteIds = new Map<string, string[]>();
    for (const document of remoteFavorites) {
        const tag = document.favorite.tags?.[0];
        if (!tag) continue;
        const key = `friend:${tag}`;
        remoteIds.set(key, [...(remoteIds.get(key) ?? []), document.objectId]);
    }
    const localIds = new Map<string, string[]>();
    for (const document of localFavorites) localIds.set(document.groupId, [...(localIds.get(document.groupId) ?? []), document.objectId]);
    return [
        ...remoteGroups.map((document) => {
            const key = `friend:${document.group.name}`;
            return { key, displayName: document.group.displayName || document.group.name, local: false, friendIds: [...new Set(remoteIds.get(key) ?? [])] };
        }),
        ...localGroups.map((document) => ({ key: `local:${document.groupId}`, displayName: document.name, local: true, friendIds: [...new Set(localIds.get(document.groupId) ?? [])] })),
    ];
}
