import { describe, expect, it } from "vitest";

import { diffFriendSnapshots, type FriendSnapshot } from "./activity-log";

const friend = (overrides: Partial<FriendSnapshot> = {}): FriendSnapshot => ({ id: "usr_example", displayName: "Example", online: true, status: "active\nHello", location: "wrld_one:1", avatar: "avatar-one", bio: "Bio", ...overrides });

describe("friend activity differences", () => {
    it("maps remote presence changes into VRCX feed categories", () => {
        const result = diffFriendSnapshots([friend()], [friend({ online: false, status: "offline\n", location: "offline" })], "2026-08-02T00:00:00.000Z");
        expect(result.map((entry) => entry.type)).toEqual(["Offline", "Status"]);
    });

    it("distinguishes relationship changes from presence changes", () => {
        const added = friend({ id: "usr_added", displayName: "Added" });
        const removed = friend({ id: "usr_removed", displayName: "Removed" });
        const result = diffFriendSnapshots([removed], [added]);
        expect(result.map((entry) => [entry.type, entry.displayName])).toEqual([
            ["Friend", "Added"],
            ["Unfriend", "Removed"],
        ]);
    });
});
