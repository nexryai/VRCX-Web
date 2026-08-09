import { describe, expect, it } from "vitest";

import { calendarDownloadHeaders, validateCalendarIcs } from "./calendar-ics";

describe("VRChat calendar downloads", () => {
    it("accepts a bounded calendar envelope without rewriting upstream bytes", () => {
        const content = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:evt_one\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        expect(validateCalendarIcs(content)).toBe(content);
        expect(validateCalendarIcs(`\uFEFF${content}`)).toBe(`\uFEFF${content}`);
    });

    it("rejects invalid, binary, and oversized calendar responses", () => {
        for (const content of ["", "BEGIN:VEVENT\nEND:VEVENT", "BEGIN:VCALENDAR\0END:VCALENDAR", `BEGIN:VCALENDAR\n${"x".repeat(1024 * 1024)}\nEND:VCALENDAR`]) {
            expect(() => validateCalendarIcs(content)).toThrow("not valid");
        }
    });

    it("uses a non-cacheable calendar attachment with the event filename", () => {
        expect(calendarDownloadHeaders("evt_one")).toEqual({
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'attachment; filename="evt_one.ics"',
            "Content-Type": "text/calendar; charset=utf-8",
        });
    });
});
