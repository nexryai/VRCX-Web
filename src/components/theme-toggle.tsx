"use client";

import { useEffect, useState } from "react";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
    const [theme, setTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<{ theme?: "dark" | "light" }>)
            .then((settings) => {
                const nextTheme = settings.theme === "light" ? "light" : "dark";
                document.documentElement.dataset.theme = nextTheme;
                setTheme(nextTheme);
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, []);

    function toggleTheme() {
        const nextTheme = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: nextTheme }) });
        setTheme(nextTheme);
    }

    return (
        <button type="button" onClick={toggleTheme} className={`inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground ${className}`} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
        </button>
    );
}
