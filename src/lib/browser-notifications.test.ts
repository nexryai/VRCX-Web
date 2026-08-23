import { describe, expect, test } from "vitest";

import { browserNotificationMessage } from "./browser-notifications";

describe("browser notification messages", () => {
    test("matches VRCX's remote friend-request title and body", () => {
        expect(browserNotificationMessage({ id: "not_one", type: "friendRequest", senderUsername: "Aoi" })).toEqual({ title: "Aoi", body: "has sent you a friend request" });
    });

    test("matches VRCX's remote invite wording and detail message", () => {
        expect(browserNotificationMessage({ id: "not_invite", type: "invite", senderUsername: "Aoi", details: { worldName: "Moonlit World", inviteMessage: "Join us" } })).toEqual({
            title: "Aoi",
            body: "has invited you to Moonlit World Join us",
        });
    });

    test("uses upstream group titles and messages without rendering HTML", () => {
        expect(browserNotificationMessage({ id: "not_two", type: "group.announcement", title: "Meetup", message: "Starts soon <b>now</b>" })).toEqual({ title: "Meetup", body: "Starts soon <b>now</b>" });
    });
});
