import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { fetchVrchatSession } from "@/lib/vrchat/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Login",
};

export default async function LoginPage() {
    const session = await fetchVrchatSession();
    if (session.status === "authenticated") {
        redirect("/");
    }

    return <LoginForm initialSession={session} />;
}
