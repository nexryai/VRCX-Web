"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronRight, ExternalLink, Heart, LogOut, Menu, X } from "lucide-react";

import { defaultNavigationConfig, type NavigationConfig, type NavigationLayoutEntry, navigationDefinitions, sanitizeNavigationConfig } from "@/lib/navigation-config";
import { BrowserNotificationBridge } from "./browser-notification-bridge";
import { CustomNavigationDialog } from "./custom-navigation-dialog";
import { MonitorStatusBar } from "./monitor-status-bar";
import { ThemeToggle } from "./theme-toggle";

type NavigationItem = { key: string; href: string; label: string; icon: string };
type NavigationEntry = NavigationItem | { key: string; label: string; icon: string; children: NavigationItem[] };

// Order, grouping, labels, and icons are translated from VRCX's
// navLayoutDefaults.js and shared/constants/ui.js. Local-only and explicitly
// excluded destinations are intentionally absent rather than disabled.
const navigationDefinitionMap = new Map(navigationDefinitions.map((definition) => [definition.key, definition]));

function buildNavigation(config: NavigationConfig): NavigationEntry[] {
    const navigation: NavigationEntry[] = [];
    for (const entry of config.layout) {
        if (entry.type === "item") {
            const definition = navigationDefinitionMap.get(entry.key);
            if (definition) navigation.push({ key: definition.key, href: definition.href, label: definition.label, icon: definition.icon });
            continue;
        }
        const children = entry.items.flatMap((key) => {
            const definition = navigationDefinitionMap.get(key);
            return definition ? [{ key: definition.key, href: definition.href, label: definition.label, icon: definition.icon }] : [];
        });
        if (children.length) navigation.push({ key: entry.id, label: entry.name, icon: entry.icon, children });
    }
    return navigation;
}

function isItem(entry: NavigationEntry): entry is NavigationItem {
    return "href" in entry;
}

function isActive(pathname: string, href: string) {
    return href === "/" ? pathname === "/" : pathname === href;
}

function navigationTitle(pathname: string, navigation: NavigationEntry[]) {
    if (pathname === "/settings") return "Settings";
    if (pathname === "/about") return "About";
    for (const entry of navigation) {
        if (isItem(entry) && isActive(pathname, entry.href)) return entry.label;
        if (!isItem(entry)) {
            const child = entry.children.find((item) => isActive(pathname, item.href));
            if (child) return child.label;
        }
    }
    return "VRCX";
}

export function AppShell({ version, children, aside }: { version: string; children: React.ReactNode; aside?: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [openFolder, setOpenFolder] = useState<string>();
    const [manageOpen, setManageOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [navigationConfig, setNavigationConfig] = useState<NavigationConfig>(defaultNavigationConfig);
    const [customNavigationOpen, setCustomNavigationOpen] = useState(false);
    const [navigationMenu, setNavigationMenu] = useState<{ x: number; y: number; itemKey?: string } | null>(null);
    const navigationMenuRef = useRef<HTMLDivElement>(null);
    const navigationMenuReturnFocus = useRef<HTMLElement | null>(null);
    const navigation = useMemo(() => buildNavigation(navigationConfig), [navigationConfig]);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<{ navigationCollapsed?: boolean; navigationConfig?: NavigationConfig }>)
            .then((settings) => {
                setCollapsed(settings.navigationCollapsed === true);
                setNavigationConfig(sanitizeNavigationConfig(settings.navigationConfig));
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!navigationMenu) return;
        const closeMenu = () => setNavigationMenu(null);
        requestAnimationFrame(() => navigationMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
        const handleKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setNavigationMenu(null);
            navigationMenuReturnFocus.current?.focus();
        };
        window.addEventListener("click", closeMenu);
        window.addEventListener("blur", closeMenu);
        window.addEventListener("keydown", handleKey);
        return () => {
            window.removeEventListener("click", closeMenu);
            window.removeEventListener("blur", closeMenu);
            window.removeEventListener("keydown", handleKey);
        };
    }, [navigationMenu]);

    useEffect(() => {
        function applySettings(event: Event) {
            const detail = (event as CustomEvent<{ navigationCollapsed?: boolean }>).detail;
            if (typeof detail?.navigationCollapsed === "boolean") setCollapsed(detail.navigationCollapsed);
        }
        window.addEventListener("vrcx:settings", applySettings);
        return () => window.removeEventListener("vrcx:settings", applySettings);
    }, []);

    useEffect(() => {
        function applyNavigation(event: Event) {
            const detail = (event as CustomEvent<NavigationConfig>).detail;
            if (detail) setNavigationConfig(sanitizeNavigationConfig(detail));
        }
        window.addEventListener("vrcx:navigation", applyNavigation);
        return () => window.removeEventListener("vrcx:navigation", applyNavigation);
    }, []);

    function toggleCollapsed() {
        const next = !collapsed;
        setCollapsed(next);
        setOpenFolder(undefined);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ navigationCollapsed: next }) });
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

    function saveNavigation(config: NavigationConfig) {
        setNavigationConfig(config);
        window.dispatchEvent(new CustomEvent("vrcx:navigation", { detail: config }));
        setCustomNavigationOpen(false);
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ navigationConfig: config }) });
    }

    function openNavigationMenu(event: React.MouseEvent, itemKey?: string) {
        event.preventDefault();
        event.stopPropagation();
        navigationMenuReturnFocus.current = event.target instanceof Element ? event.target.closest<HTMLElement>("a, button") : null;
        setNavigationMenu({ x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 90), itemKey });
    }

    function unpinTool(itemKey: string) {
        const layout: NavigationLayoutEntry[] = [];
        for (const entry of navigationConfig.layout) {
            if (entry.type === "item") {
                if (entry.key !== itemKey) layout.push(entry);
                continue;
            }
            const items = entry.items.filter((key) => key !== itemKey);
            if (items.length) layout.push({ ...entry, items });
        }
        saveNavigation(sanitizeNavigationConfig({ ...navigationConfig, layout }));
        setNavigationMenu(null);
    }

    return (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-sidebar text-foreground">
            <BrowserNotificationBridge />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {mobileOpen ? <button type="button" className="fixed inset-0 z-40 bg-black/55 md:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
                <aside
                    className={`fixed inset-y-0 left-0 z-50 flex w-[min(240px,86vw)] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:transition-[width] ${collapsed ? "md:w-12" : "md:w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
                    aria-label="Main navigation"
                >
                    <div className="flex h-11 shrink-0 items-center gap-2 px-2 md:hidden">
                        <Image src="/vrcx.png" alt="" width={26} height={26} />
                        <span className="text-sm font-medium">VRCX</span>
                        <button type="button" className="ml-auto inline-flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                            <X aria-hidden="true" className="size-4" />
                        </button>
                    </div>

                    <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" onContextMenu={(event) => openNavigationMenu(event)}>
                        <ul className="space-y-1">
                            {navigation.map((entry) => {
                                if (isItem(entry)) {
                                    const active = isActive(pathname, entry.href);
                                    return (
                                        <li key={entry.key} onContextMenu={(event) => openNavigationMenu(event, entry.key)}>
                                            <Link
                                                href={entry.href}
                                                title={collapsed ? entry.label : undefined}
                                                onClick={() => setMobileOpen(false)}
                                                className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70"}`}
                                            >
                                                <i className={`${entry.icon} inline-flex size-6 shrink-0 items-center justify-center text-lg`} aria-hidden="true" />
                                                <span className={collapsed ? "md:hidden" : ""}>{entry.label}</span>
                                            </Link>
                                        </li>
                                    );
                                }

                                const active = entry.children.some((item) => isActive(pathname, item.href));
                                const expanded = openFolder === entry.label || (!collapsed && active && openFolder === undefined);
                                return (
                                    <li key={entry.key} className="relative" onContextMenu={(event) => openNavigationMenu(event)}>
                                        <button
                                            type="button"
                                            title={collapsed ? entry.label : undefined}
                                            onClick={() => setOpenFolder((current) => (current === entry.label ? "" : entry.label))}
                                            className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/70"}`}
                                            aria-expanded={expanded}
                                        >
                                            <i className={`${entry.icon} inline-flex size-6 shrink-0 items-center justify-center text-lg`} aria-hidden="true" />
                                            <span className={collapsed ? "md:hidden" : ""}>{entry.label}</span>
                                            <ChevronRight aria-hidden="true" className={`ml-auto size-4 transition-transform ${expanded ? "rotate-90" : ""} ${collapsed ? "md:hidden" : ""}`} />
                                        </button>
                                        {expanded ? (
                                            <ul className={collapsed ? "absolute top-0 left-11 z-50 w-56 space-y-1 rounded-md border border-border bg-popover p-1 shadow-lg" : "mt-1 ml-4 space-y-1 border-l border-sidebar-border pl-2"}>
                                                {entry.children.map((item) => (
                                                    <li key={item.key} onContextMenu={(event) => openNavigationMenu(event, item.key)}>
                                                        <Link href={item.href} onClick={() => setMobileOpen(false)} className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${isActive(pathname, item.href) ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/70"}`}>
                                                            <i className={`${item.icon} inline-flex size-5 shrink-0 items-center justify-center text-base`} aria-hidden="true" />
                                                            <span>{item.label}</span>
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    <div className="relative shrink-0 space-y-1 px-2 py-3">
                        {helpOpen ? (
                            <div className="absolute bottom-[6.75rem] left-2 z-50 w-56 rounded-md border border-border bg-popover p-1 text-sm shadow-lg">
                                <Link href="/about" className="flex h-8 items-center rounded px-2 hover:bg-accent">
                                    About and notices
                                </Link>
                                <div className="my-1 border-t border-border" />
                                <p className="px-2 py-1 text-xs text-muted-foreground">Resources</p>
                                <a href="https://github.com/vrcx-team/VRCX/wiki" target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded px-2 hover:bg-accent">
                                    VRCX Wiki <ExternalLink className="ml-auto size-3" />
                                </a>
                                <div className="my-1 border-t border-border" />
                                <p className="px-2 py-1 text-xs text-muted-foreground">Get Help</p>
                                <a href="https://github.com/vrcx-team/VRCX" target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded px-2 hover:bg-accent">
                                    GitHub <ExternalLink className="ml-auto size-3" />
                                </a>
                                <a href="https://vrcx.app/discord" target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2 rounded px-2 hover:bg-accent">
                                    Join our Discord <ExternalLink className="ml-auto size-3" />
                                </a>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                setHelpOpen((value) => !value);
                                setManageOpen(false);
                            }}
                            title={collapsed ? "Help & Support" : undefined}
                            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent"
                        >
                            <i className="ri-question-line inline-flex size-6 items-center justify-center text-lg" aria-hidden="true" />
                            <span className={collapsed ? "md:hidden" : ""}>Help &amp; Support</span>
                        </button>
                        {manageOpen ? (
                            <div className="absolute bottom-[3.25rem] left-2 z-50 w-56 rounded-md border border-border bg-popover p-1 text-sm shadow-lg">
                                <div className="flex items-center gap-2 px-2 py-1.5">
                                    <Image src="/vrcx.png" alt="" width={24} height={24} />
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1 truncate font-medium">
                                            VRCX <Heart className="size-3 fill-primary text-primary" />
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">{version}</p>
                                    </div>
                                </div>
                                <div className="my-1 border-t border-border" />
                                <div className="flex h-9 items-center justify-between px-2">
                                    <span>Theme</span>
                                    <ThemeToggle className="size-8 rounded-md" />
                                </div>
                                <Link href="/settings" onClick={() => setManageOpen(false)} className="flex h-8 items-center rounded px-2 hover:bg-accent">
                                    Settings
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManageOpen(false);
                                        setCustomNavigationOpen(true);
                                    }}
                                    className="flex h-8 w-full items-center rounded px-2 hover:bg-accent"
                                >
                                    Customize Navigation
                                </button>
                                <div className="my-1 border-t border-border" />
                                <button type="button" onClick={() => void logout()} disabled={loggingOut} className="flex h-8 w-full items-center gap-2 rounded px-2 text-destructive hover:bg-accent disabled:opacity-50">
                                    <LogOut className="size-4" />
                                    Log out
                                </button>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                setManageOpen((value) => !value);
                                setHelpOpen(false);
                            }}
                            title={collapsed ? "Manage" : undefined}
                            className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent ${pathname === "/settings" ? "bg-sidebar-accent font-medium" : ""}`}
                        >
                            <i className="ri-settings-3-line inline-flex size-6 items-center justify-center text-lg" aria-hidden="true" />
                            <span className={collapsed ? "md:hidden" : ""}>Manage</span>
                        </button>
                        <button type="button" onClick={toggleCollapsed} title={collapsed ? "Expand Menu" : undefined} className="hidden h-8 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent md:flex">
                            <i className="ri-side-bar-line inline-flex size-6 items-center justify-center text-[19px]" aria-hidden="true" />
                            <span className={collapsed ? "md:hidden" : ""}>Collapse Menu</span>
                        </button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-sidebar-border px-2 md:hidden">
                        <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-sidebar-accent" aria-label="Open navigation">
                            <Menu aria-hidden="true" className="size-5" />
                        </button>
                        <span className="text-sm font-medium">{navigationTitle(pathname, navigation)}</span>
                    </header>
                    <div className="flex min-h-0 flex-1">
                        <main className="min-w-0 flex-1 overflow-hidden bg-background md:m-2 md:mr-0 md:rounded-md md:border">{children}</main>
                        {aside}
                    </div>
                </div>
            </div>
            <MonitorStatusBar />
            {navigationMenu ? (
                <div ref={navigationMenuRef} role="menu" aria-label="Navigation actions" style={{ left: navigationMenu.x, top: navigationMenu.y }} className="fixed z-[90] min-w-44 rounded-md border border-border bg-popover p-1 text-xs shadow-lg" onClick={(event) => event.stopPropagation()}>
                    {navigationMenu.itemKey?.startsWith("tool-") ? (
                        <button type="button" role="menuitem" onClick={() => unpinTool(navigationMenu.itemKey ?? "")} className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-accent">
                            Unpin
                        </button>
                    ) : null}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setNavigationMenu(null);
                            setCustomNavigationOpen(true);
                        }}
                        className="flex h-8 w-full items-center rounded px-2 text-left hover:bg-accent"
                    >
                        Customize Navigation
                    </button>
                </div>
            ) : null}
            <CustomNavigationDialog open={customNavigationOpen} config={navigationConfig} close={() => setCustomNavigationOpen(false)} saved={saveNavigation} />
        </div>
    );
}
