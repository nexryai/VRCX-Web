import type { Metadata } from "next";

import { FavoriteView } from "@/components/favorites/favorite-view";

export const metadata: Metadata = { title: "Favorite Friends" };

export default function FavoriteFriendsPage() {
    return <FavoriteView kind="friend" />;
}
