import type { Metadata } from "next";

import { ActivityView } from "@/components/activity/activity-view";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
    return <ActivityView mode="feed" />;
}
