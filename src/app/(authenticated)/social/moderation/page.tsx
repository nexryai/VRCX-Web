import type { Metadata } from "next";

import { ModerationView } from "@/components/moderation/moderation-view";

export const metadata: Metadata = {
    title: "Moderation",
};

export default function ModerationPage() {
    return <ModerationView />;
}
