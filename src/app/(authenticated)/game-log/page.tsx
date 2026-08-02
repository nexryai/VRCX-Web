import type { Metadata } from "next";

import { GameLogView } from "@/components/game-log/game-log-view";

export const metadata: Metadata = { title: "Game Log" };

export default function GameLogPage() {
    return <GameLogView />;
}
