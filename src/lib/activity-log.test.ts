import { describe, expect, it } from "vitest";

import { diffFriendSnapshots, type FriendSnapshot, trustLevelFromTags } from "./activity-log";

const friend = (overrides: Partial<FriendSnapshot> = {}): FriendSnapshot => ({ id: "usr_example", displayName: "Example", online: true, status: "active\nHello", location: "wrld_one:1", avatar: "avatar-one", bio: "Bio", trustLevel: "User", ...overrides });

describe("friend activity differences", () => {
    it("maps remote presence changes into VRCX feed categories", () => {
        const result = diffFriendSnapshots([friend()], [friend({ online: false, status: "offline\n", location: "offline" })], "2026-08-02T00:00:00.000Z");
        expect(result.map((entry) => entry.type)).toEqual(["Offline", "Status"]);
        expect(result[0]).toMatchObject({ previous: "wrld_one:1", current: "offline" });
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

    it("diffs the active identity without fabricating relationship events", () => {
        expect(diffFriendSnapshots([], [friend()], "2026-08-02T00:00:00.000Z", false)).toEqual([]);
        const result = diffFriendSnapshots([friend()], [friend({ location: "wrld_two:2", status: "join me\nOwn session" })], "2026-08-02T00:01:00.000Z", false);
        expect(result.map((entry) => entry.type)).toEqual(["GPS", "Status"]);
    });

    it("ports VRCX trust ranks and records remotely observed rank changes", () => {
        expect(trustLevelFromTags(["system_trust_veteran"])).toBe("Trusted User");
        expect(trustLevelFromTags(["system_trust_trusted"])).toBe("Known User");
        expect(diffFriendSnapshots([friend()], [friend({ trustLevel: "Known User" })])[0]).toMatchObject({ type: "TrustLevel", previous: "User", current: "Known User" });
    });
});
