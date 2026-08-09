import type { Metadata } from "next";

import { HotWorldsView } from "@/components/charts/hot-worlds-view";

export const metadata: Metadata = { title: "Hot Worlds" };

export default function HotWorldsPage() {
    return <HotWorldsView />;
}
