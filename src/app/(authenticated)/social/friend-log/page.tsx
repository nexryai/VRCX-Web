import type { Metadata } from "next";

import { ActivityView } from "@/components/activity/activity-view";

export const metadata: Metadata = { title: "Friend Log" };

export default function FriendLogPage() {
    return <ActivityView mode="friend-log" />;
}
