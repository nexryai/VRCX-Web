import type { Metadata } from "next";

import { FriendListView } from "@/components/friends/friend-list-view";

export const metadata: Metadata = {
    title: "Friend List",
};

export default function FriendListPage() {
    return <FriendListView />;
}
