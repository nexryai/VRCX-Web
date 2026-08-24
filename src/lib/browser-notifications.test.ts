import { describe, expect, test } from "vitest";

import { browserActivityMessage, browserNotificationMessage } from "./browser-notifications";

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

    test("formats remotely observed friend activity with VRCX wording", () => {
        expect(browserActivityMessage({ id: "event_online", type: "Online", displayName: "Aoi", current: "Moonlit World" })).toEqual({ title: "Aoi", body: "has logged in to Moonlit World" });
        expect(browserActivityMessage({ id: "event_name", type: "DisplayName", displayName: "Aoi New", previous: "Aoi Old" })).toEqual({ title: "Aoi Old", body: "changed their name to Aoi New" });
    });
});
