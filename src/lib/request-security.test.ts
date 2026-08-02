import { describe, expect, it } from "vitest";

import { isMutationOriginAllowed } from "./request-security";

function request(headers: Record<string, string>) {
    return { headers: new Headers(headers), nextUrl: new URL("https://vrcx.internal/api/example") } as never;
}

describe("mutation origin checks", () => {
    it("accepts same-origin browser requests behind a proxy", () => {
        expect(isMutationOriginAllowed(request({ origin: "https://vrcx.example", "sec-fetch-site": "same-origin", "x-forwarded-host": "vrcx.example", "x-forwarded-proto": "https" }))).toBe(true);
    });

    it("trusts same-origin Fetch Metadata when a proxy exposes its internal host", () => {
        expect(
            isMutationOriginAllowed(
                request({
                    host: "app:3000",
                    origin: "https://vrcx.example",
                    "sec-fetch-site": "same-origin",
                    "x-forwarded-host": "app:3000",
                    "x-forwarded-proto": "http",
                }),
            ),
        ).toBe(true);
    });

    it("checks Origin when Fetch Metadata is unavailable", () => {
        expect(isMutationOriginAllowed(request({ origin: "https://vrcx.example", "x-forwarded-host": "vrcx.example", "x-forwarded-proto": "https" }))).toBe(true);
        expect(isMutationOriginAllowed(request({ origin: "https://attacker.example", "x-forwarded-host": "vrcx.example", "x-forwarded-proto": "https" }))).toBe(false);
    });

    it("rejects cross-site browser requests", () => {
        expect(isMutationOriginAllowed(request({ origin: "https://attacker.example", "sec-fetch-site": "cross-site", host: "vrcx.internal" }))).toBe(false);
    });
});
