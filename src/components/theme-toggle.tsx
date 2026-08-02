"use client";

import { useEffect, useState } from "react";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
    const [theme, setTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const saved = window.localStorage.getItem("vrcx-theme");
        const nextTheme = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        document.documentElement.dataset.theme = nextTheme;
        setTheme(nextTheme);
    }, []);

    function toggleTheme() {
        const nextTheme = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = nextTheme;
        window.localStorage.setItem("vrcx-theme", nextTheme);
        setTheme(nextTheme);
    }

    return (
        <button type="button" onClick={toggleTheme} className={`inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground ${className}`} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
        </button>
    );
}
