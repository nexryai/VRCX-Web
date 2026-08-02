import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { FriendsProvider } from "@/components/friends/friends-provider";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { fetchVrchatSession } from "@/lib/vrchat/session";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    const session = await fetchVrchatSession();
    if (session.status !== "authenticated") {
        redirect("/login");
    }

    return (
        <CurrentUserProvider user={session.user}>
            <FriendsProvider>
                <AppShell user={session.user} aside={<FriendsSidebar />}>
                    {children}
                </AppShell>
            </FriendsProvider>
        </CurrentUserProvider>
    );
}
