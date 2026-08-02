import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
    title: {
        default: "VRCX",
        template: "%s · VRCX",
    },
    description: "A continuously monitored, single-user Next.js port of VRCX.",
    icons: {
        icon: "/vrcx.png",
        apple: "/vrcx.png",
    },
};

export const viewport: Viewport = {
    colorScheme: "dark light",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#18181b" },
    ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" data-theme="dark" suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
