import { User } from "lucide-react";

import { friendImage, statusColor } from "@/lib/friends";
import type { VrchatUser } from "@/lib/vrchat/types";

export function FriendAvatar({ friend, size = "md", showStatus = true }: { friend: VrchatUser; size?: "sm" | "md"; showStatus?: boolean }) {
    const image = friendImage(friend);
    const sizeClass = size === "sm" ? "size-8" : "size-9";

    return (
        <span className={`relative inline-flex shrink-0 ${sizeClass}`}>
            <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">{image ? <img src={image} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <User aria-hidden="true" className="size-4" />}</span>
            {showStatus ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-card" style={{ backgroundColor: statusColor(friend.status) }} aria-hidden="true" /> : null}
        </span>
    );
}
