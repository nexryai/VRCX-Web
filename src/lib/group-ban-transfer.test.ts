import { describe, expect, it } from "vitest";

import { extractGroupBanUserIds, formatGroupBanCsv } from "./group-ban-transfer";

const first = "usr_00000000-0000-0000-0000-000000000001";
const second = "usr_00000000-0000-0000-0000-000000000002";

describe("group ban transfer", () => {
    it("extracts unique canonical user IDs from raw and CSV input", () => {
        expect(extractGroupBanUserIds(`User ID,Display Name\r\n${first},One\n${second}\n${first}`)).toEqual([first, second]);
        expect(extractGroupBanUserIds("usr_bad")).toEqual([]);
    });

    it("formats selected VRCX fields and neutralizes spreadsheet formulas", () => {
        const output = formatGroupBanCsv(["userId", "displayName", "roles", "bannedAt"], [{ id: "ban", userId: first, roleIds: ["role"], user: { id: first, displayName: "=IMPORTXML()", tags: [] }, bannedAt: "2026-08-17T12:00:00.000Z" }], new Map([["role", "Hosts"]]));
        expect(output).toBe('"userId","displayName","roles","bannedAt"\r\n"usr_00000000-0000-0000-0000-000000000001","\'=IMPORTXML()","Hosts","2026-08-17T12:00:00.000Z"');
    });
});
