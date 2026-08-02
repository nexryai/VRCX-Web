import type { Metadata } from "next";

import { FavoriteView } from "@/components/favorites/favorite-view";

export const metadata: Metadata = { title: "Favorite Avatars" };

export default function FavoriteAvatarsPage() {
    return <FavoriteView kind="avatar" />;
}
