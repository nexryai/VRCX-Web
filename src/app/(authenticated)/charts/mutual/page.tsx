import type { Metadata } from "next";

import { MutualFriendsView } from "@/components/charts/mutual-friends-view";

export const metadata: Metadata = { title: "Mutual Friends" };

export default function MutualFriendsPage() {
    return <MutualFriendsView />;
}
