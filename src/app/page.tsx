import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { FriendsLocationsView } from "@/components/friends/friends-locations-view";
import { FriendsProvider } from "@/components/friends/friends-provider";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { fetchVrchatSession, readVrchatCookies } from "@/lib/vrchat/session";

export const metadata: Metadata = {
    title: "Friends Locations",
};

export default async function Home() {
    const session = await fetchVrchatSession(readVrchatCookies(await cookies()));
    if (session.status !== "authenticated") {
        redirect("/login");
    }

    return (
        <FriendsProvider>
            <AppShell user={session.user} aside={<FriendsSidebar />}>
                <FriendsLocationsView />
            </AppShell>
        </FriendsProvider>
    );
}
