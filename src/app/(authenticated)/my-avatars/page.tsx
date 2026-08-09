import type { Metadata } from "next";

import { MyAvatarsView } from "@/components/avatars/my-avatars-view";

export const metadata: Metadata = { title: "My Avatars" };

export default function MyAvatarsPage() {
    return <MyAvatarsView />;
}
