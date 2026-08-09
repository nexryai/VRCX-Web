import { describe, expect, it } from "vitest";

import { type FriendListUser, friendListResponseSchema, friendMatchesSearch } from "./friend-list";

const friend: FriendListUser = {
    id: "usr_00000000-0000-0000-0000-000000000001",
    displayName: "Aoi Sample",
    username: "hidden_account_name",
    status: "join me",
    statusDescription: "Building a quiet world",
    bio: "World creator",
    note: "Remember the meetup",
    tags: ["system_trust_trusted"],
    $memo: "Met through the browser port crew",
};

describe("Friend List search", () => {
    it("searches Note and owner-local Memo by default", () => {
        expect(friendMatchesSearch(friend, "remember the", [])).toBe(true);
        expect(friendMatchesSearch(friend, "browser port", [])).toBe(true);
    });

    it("matches only explicitly selected fields", () => {
        expect(friendMatchesSearch(friend, "browser port", ["Note"])).toBe(false);
        expect(friendMatchesSearch(friend, "remember", ["Memo"])).toBe(false);
        expect(friendMatchesSearch(friend, "known user", ["Rank"])).toBe(true);
    });

    it("keeps User Name opt-in like VRCX", () => {
        expect(friendMatchesSearch(friend, "hidden_account", [])).toBe(false);
        expect(friendMatchesSearch(friend, "hidden_account", ["User Name"])).toBe(true);
    });

    it("validates the projected local memo at the browser boundary", () => {
        expect(friendListResponseSchema.parse({ friends: [{ id: friend.id, displayName: friend.displayName }] }).friends[0].$memo).toBe("");
        expect(friendListResponseSchema.safeParse({ friends: [{ ...friend, $memo: 42 }] }).success).toBe(false);
    });
});
