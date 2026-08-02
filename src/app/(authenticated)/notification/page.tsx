import type { Metadata } from "next";

import { NotificationView } from "@/components/notifications/notification-view";

export const metadata: Metadata = {
    title: "Notifications",
};

export default function NotificationPage() {
    return <NotificationView />;
}
