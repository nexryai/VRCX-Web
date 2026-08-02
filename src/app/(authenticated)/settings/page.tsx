import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
    return <SettingsView version={process.env.npm_package_version || "0.1.0"} />;
}
