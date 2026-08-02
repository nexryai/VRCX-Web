import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { fetchVrchatSession, readVrchatCookies } from "@/lib/vrchat/session";

export const metadata: Metadata = {
    title: "Login",
};

export default async function LoginPage() {
    const session = await fetchVrchatSession(readVrchatCookies(await cookies()));
    if (session.status === "authenticated") {
        redirect("/");
    }

    return <LoginForm initialSession={session} />;
}
