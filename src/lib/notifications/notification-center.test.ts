import { describe, expect, test } from "vitest";

import { notificationCategory, splitNotificationCenter } from "./notification-center";

describe("notification center projection", () => {
    test("matches VRCX's friend, group, and other categories", () => {
        expect(notificationCategory("friendRequest")).toBe("friend");
        expect(notificationCategory("moderation.group.block")).toBe("group");
        expect(notificationCategory("instance.closed")).toBe("other");
    });

    test("separates unseen rows from seen rows in the last 24 hours", () => {
        const now = new Date("2026-08-23T12:00:00.000Z").getTime();
        const result = splitNotificationCenter(
            [
                { id: "not_unseen", type: "invite", seen: false, created_at: now - 1_000 },
                { id: "not_recent", type: "group.announcement", seen: true, created_at: now - 60_000 },
                { id: "not_old", type: "message", seen: true, created_at: now - 25 * 60 * 60_000 },
            ],
            now,
        );
        expect(result.unseen.friend.map((item) => item.id)).toEqual(["not_unseen"]);
        expect(result.recent.group.map((item) => item.id)).toEqual(["not_recent"]);
        expect(result.recent.other).toEqual([]);
    });
});
