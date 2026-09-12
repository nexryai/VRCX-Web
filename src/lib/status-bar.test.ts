import { describe, expect, it } from "vitest";

import { buildPipelineRateSamples, formatAppUptime, formatClock, formatUtcHour, normalizeUtcHour } from "./status-bar";

describe("status bar utilities", () => {
    it("normalizes and labels the same integer UTC range as VRCX", () => {
        expect(normalizeUtcHour(-13)).toBe(-12);
        expect(normalizeUtcHour(14.6)).toBe(14);
        expect(normalizeUtcHour(Number.NaN)).toBe(0);
        expect(formatUtcHour(9)).toBe("UTC+9");
        expect(formatUtcHour(-5)).toBe("UTC-5");
    });

    it("formats fixed-offset clocks independently of the browser timezone", () => {
        const now = new Date("2026-09-13T12:34:56.000Z");
        expect(formatClock(now, 9)).toBe("21:34 UTC+9");
        expect(formatClock(now, -5)).toBe("07:34 UTC-5");
    });

    it("formats monitor uptime without wrapping after 24 hours", () => {
        expect(formatAppUptime(0)).toBe("00:00:00");
        expect(formatAppUptime(90_061.9)).toBe("25:01:01");
    });

    it("buckets only the latest 60 seconds of Pipeline observations", () => {
        const now = new Date("2026-09-13T12:01:00.900Z");
        const samples = buildPipelineRateSamples([new Date("2026-09-13T12:00:01.100Z"), new Date("2026-09-13T12:00:59.100Z"), new Date("2026-09-13T12:00:59.900Z"), new Date("2026-09-13T12:01:00.100Z"), new Date("2026-09-13T12:01:01.000Z")], now);
        expect(samples).toHaveLength(60);
        expect(samples[0]).toBe(1);
        expect(samples[58]).toBe(2);
        expect(samples[59]).toBe(1);
        expect(samples.reduce((total, count) => total + count, 0)).toBe(4);
    });
});
