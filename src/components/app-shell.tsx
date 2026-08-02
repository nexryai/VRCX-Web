"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, ExternalLink, LogOut, Menu, X } from "lucide-react";

import { friendImage, statusColor } from "@/lib/friends";
import type { VrchatUser } from "@/lib/vrchat/types";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
    { href: "/", label: "Friends Locations", icon: "ri-user-location-line" },
    { href: "/notification", label: "Notifications", icon: "ri-notification-2-line" },
    { href: "/search", label: "Search", icon: "ri-search-line" },
    { href: "/social/friend-list", label: "Friend List", icon: "ri-booklet-line" },
    { href: "/social/moderation", label: "Moderation", icon: "ri-shield-user-line" },
];

export function AppShell({ user, children, aside }: { user: VrchatUser; children: React.ReactNode; aside?: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        setCollapsed(window.localStorage.getItem("vrcx-nav-collapsed") === "true");
    }, []);

    function toggleCollapsed() {
        const next = !collapsed;
        setCollapsed(next);
        window.localStorage.setItem("vrcx-nav-collapsed", String(next));
    }

    async function logout() {
        setLoggingOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            router.replace("/login");
            router.refresh();
        }
    }

    const image = friendImage(user);
    const navWidth = collapsed ? "md:w-12" : "md:w-60";
    const currentTitle = navigation.find((item) => item.href === pathname)?.label || "VRCX Web";

    return (
        <div className="flex h-dvh min-h-0 overflow-hidden bg-sidebar text-foreground">
            {mobileOpen ? <button type="button" className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] md:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:transition-[width] ${navWidth} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
                aria-label="Main navigation"
            >
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-2 md:hidden">
                    <Image src="/vrcx.png" alt="" width={28} height={28} className="rounded-md" />
                    <span className="font-semibold">VRCX Web</span>
                    <button type="button" className="ml-auto inline-flex size-9 items-center justify-center rounded-full hover:bg-sidebar-accent" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                        <X aria-hidden="true" className="size-4" />
                    </button>
                </div>
                <nav className="min-h-0 flex-1 overflow-y-auto p-2">
                    <ul className="space-y-1">
                        {navigation.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        title={collapsed ? item.label : undefined}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70"}`}
                                    >
                                        <i className={`${item.icon} inline-flex size-6 shrink-0 items-center justify-center text-lg`} aria-hidden="true" />
                                        <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <div className="shrink-0 border-t border-sidebar-border p-2">
                    <div className={`mb-1 flex min-w-0 items-center gap-2 rounded-md p-1.5 ${collapsed ? "md:justify-center" : ""}`}>
                        <span className="relative inline-flex size-8 shrink-0">
                            <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted">{image ? <img src={image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : <Image src="/vrcx.png" alt="" width={32} height={32} />}</span>
                            <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-sidebar" style={{ backgroundColor: statusColor(user.status) }} aria-hidden="true" />
                        </span>
                        <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
                            <p className="truncate text-xs font-medium">{user.displayName}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{user.statusDescription || user.status || "VRChat"}</p>
                        </div>
                    </div>
                    <div className={`flex items-center ${collapsed ? "md:flex-col" : ""}`}>
                        <a href="https://github.com/vrcx-team/VRCX" target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label="Open VRCX on GitHub">
                            <ExternalLink aria-hidden="true" className="size-4" />
                        </a>
                        <ThemeToggle />
                        <button type="button" onClick={() => void logout()} disabled={loggingOut} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50" aria-label="Log out">
                            <LogOut aria-hidden="true" className="size-4" />
                        </button>
                        <button type="button" onClick={toggleCollapsed} className="ml-auto hidden size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:inline-flex" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
                            {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
                        </button>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-2 md:hidden">
                    <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-sidebar-accent" aria-label="Open navigation">
                        <Menu aria-hidden="true" className="size-5" />
                    </button>
                    <span className="text-sm font-semibold">{currentTitle}</span>
                </header>
                <div className="flex min-h-0 flex-1">
                    <main className="m-0 min-w-0 flex-1 overflow-hidden border-border bg-background md:m-2 md:mr-0 md:rounded-lg md:border">{children}</main>
                    {aside}
                </div>
                <footer className="hidden h-5 shrink-0 items-center justify-between border-t border-sidebar-border px-2 text-[10px] text-muted-foreground md:flex">
                    <span>{user.displayName}</span>
                    <span>Connected to VRChat API</span>
                </footer>
            </div>
        </div>
    );
}
