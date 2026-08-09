import { describe, expect, it } from "vitest";

import { formatFavoriteCsv, isVrcxCsvExport, parseFavoriteIds } from "./favorites-transfer";

describe("favorites transfer", () => {
    it("extracts unique IDs only for the requested favorite kind", () => {
        const world = "wrld_00000000-0000-0000-0000-000000000010";
        const user = "usr_00000000-0000-0000-0000-000000000002";
        expect(parseFavoriteIds("world", `${user}\n${world}\n${world}`)).toEqual([world]);
        expect(parseFavoriteIds("world", "wrld_000000000000-0000-0000-000000000010")).toEqual([]);
        expect(parseFavoriteIds("world", `${world}-extra`)).toEqual([]);
    });

    it("accepts the exact VRCX favorite and list CSV layouts", () => {
        const friend = "usr_00000000-0000-0000-0000-000000000002";
        const world = "wrld_00000000-0000-0000-0000-000000000010";
        const avatar = "avtr_00000000-0000-0000-0000-000000000061";
        const friendFavoriteExport = `${friend},Aoi Sample\nUserID,Name`;
        const friendListExport = `UserID,DisplayName,Memo\n${friend},Aoi Sample,Met in VRChat`;
        const worldFavoriteExport = `${world},The Great Pug\nID,Name`;
        const avatarFavoriteExport = `${avatar},Browser Dance Avatar\nID,Name`;
        const ownAvatarExport = `AvatarID,AvatarName\n${avatar},Browser Dance Avatar`;

        expect(isVrcxCsvExport("friend", friendFavoriteExport)).toBe(true);
        expect(isVrcxCsvExport("friend", friendListExport)).toBe(true);
        expect(isVrcxCsvExport("world", worldFavoriteExport)).toBe(true);
        expect(isVrcxCsvExport("world", `${world},The Great Pug\nName,ID`)).toBe(true);
        expect(isVrcxCsvExport("avatar", avatarFavoriteExport)).toBe(true);
        expect(isVrcxCsvExport("avatar", ownAvatarExport)).toBe(true);
        expect(parseFavoriteIds("friend", friendFavoriteExport)).toEqual([friend]);
        expect(parseFavoriteIds("friend", friendListExport)).toEqual([friend]);
        expect(parseFavoriteIds("world", worldFavoriteExport)).toEqual([world]);
        expect(parseFavoriteIds("avatar", `${avatarFavoriteExport}\n${ownAvatarExport}`)).toEqual([avatar]);
    });

    it("quotes CSV fields and neutralizes spreadsheet formulas", () => {
        expect(formatFavoriteCsv(["Name", "Group"], [{ Name: '=LINK("bad")', Group: 'Builders, "VR"' }])).toBe('"Name","Group"\r\n"\'=LINK(""bad"")","Builders, ""VR"""');
    });
});
