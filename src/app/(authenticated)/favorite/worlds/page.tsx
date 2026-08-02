import type { Metadata } from "next";

import { FavoriteView } from "@/components/favorites/favorite-view";

export const metadata: Metadata = { title: "Favorite Worlds" };

export default function FavoriteWorldsPage() {
    return <FavoriteView kind="world" />;
}
