import "server-only";

import { serializeAppSettings } from "@/lib/app-settings";
import { selectFavoriteFriendIds } from "@/lib/friend-favorites";
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
