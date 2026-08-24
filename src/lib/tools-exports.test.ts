import { describe, expect, it } from "vitest";

import { formatDiscordNamesCsv, formatFriendsListExports, formatOwnedAvatarsCsv } from "./tools-exports";

describe("VRCX Tools exports", () => {
    it("exports the VRCX friend-list CSV and JSON shapes", () => {
        const result = formatFriendsListExports([
            { id: "usr_b", displayName: "B", memo: "line one\nline two" },
            { id: "usr_a", displayName: "A, Builder", memo: '=LINK("bad")' },
        ]);
        expect(result.csv).toBe('"UserID","DisplayName","Memo"\r\n"usr_b","B","line one line two"\r\n"usr_a","A, Builder","\'=LINK(""bad"")"');
        expect(JSON.parse(result.json)).toEqual({ friends: ["usr_b", "usr_a"] });
    });

    it("extracts Discord names from status before bio like VRCX", () => {
        expect(
            formatDiscordNamesCsv([
                { id: "usr_a", displayName: "Aoi", statusDescription: "discord: aoi_status", bio: "Discord: aoi_bio" },
                { id: "usr_b", displayName: "Cobalt", bio: "Find me at dc=cobalt#1234" },
                { id: "usr_c", displayName: "No Match", bio: "Builder" },
            ]),
        ).toBe('"DisplayName","DiscordName"\r\n"Aoi","aoi_status"\r\n"Cobalt","cobalt#1234"');
    });

    it("exports owned avatar IDs and names in upstream order", () => {
        expect(
            formatOwnedAvatarsCsv([
                { id: "avtr_b", name: "Zed" },
                { id: "avtr_a", name: "Alpha" },
            ]),
        ).toBe('"AvatarID","AvatarName"\r\n"avtr_b","Zed"\r\n"avtr_a","Alpha"');
    });
});
