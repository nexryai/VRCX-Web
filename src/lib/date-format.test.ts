import { describe, expect, it } from "vitest";

import { calendarGridStart, formatVrcxDate, orderedWeekdays } from "./date-format";

describe("VRCX date formatting", () => {
    it("ports ISO long format and rejects invalid values", () => {
        const value = new Date(2026, 8, 13, 9, 4, 5);
        expect(formatVrcxDate(value, "long", { hour12: false, iso: true })).toBe("2026-09-13 09:04:05");
        expect(formatVrcxDate("invalid", "long", { hour12: false, iso: false })).toBe("-");
    });

    it("passes the selected hour cycle to short and time formats", () => {
        const value = new Date(2026, 8, 13, 21, 4, 5);
        expect(formatVrcxDate(value, "short", { hour12: true, iso: false }, "en-US")).toContain("pm");
        expect(formatVrcxDate(value, "time", { hour12: false, iso: false }, "en-US")).toMatch(/21:04/);
    });

    it("rotates weekday labels and month-grid bounds", () => {
        const first = new Date(2026, 8, 1);
        expect(orderedWeekdays(1)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(calendarGridStart(first, 1).getDate()).toBe(31);
        expect(calendarGridStart(first, 6).getDate()).toBe(29);
    });
});
