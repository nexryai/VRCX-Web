import type { Metadata } from "next";

import { FriendsLocationsView } from "@/components/friends/friends-locations-view";

export const metadata: Metadata = {
    title: "Friends Locations",
};

export default function FriendsLocationsPage() {
    return <FriendsLocationsView />;
}
