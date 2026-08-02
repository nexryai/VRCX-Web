import { describe, expect, it } from "vitest";

import { formatFavoriteCsv, parseFavoriteIds } from "./favorites-transfer";

describe("favorites transfer", () => {
    it("extracts unique IDs only for the requested favorite kind", () => {
        const world = "wrld_00000000-0000-0000-0000-000000000010";
        const user = "usr_00000000-0000-0000-0000-000000000002";
        expect(parseFavoriteIds("world", `${user}\n${world}\n${world}`)).toEqual([world]);
    });

    it("quotes CSV fields and neutralizes spreadsheet formulas", () => {
        expect(formatFavoriteCsv(["Name", "Group"], [{ Name: '=LINK("bad")', Group: 'Builders, "VR"' }])).toBe('"Name","Group"\r\n"\'=LINK(""bad"")","Builders, ""VR"""');
    });
});
