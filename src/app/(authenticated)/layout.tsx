import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { FriendsProvider } from "@/components/friends/friends-provider";
import { FriendsSidebar } from "@/components/friends/friends-sidebar";
import { fetchVrchatSession, readVrchatCookies } from "@/lib/vrchat/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    const session = await fetchVrchatSession(readVrchatCookies(await cookies()));
    if (session.status !== "authenticated") {
        redirect("/login");
    }

    return (
        <FriendsProvider>
            <AppShell user={session.user} aside={<FriendsSidebar />}>
                {children}
            </AppShell>
        </FriendsProvider>
    );
}
