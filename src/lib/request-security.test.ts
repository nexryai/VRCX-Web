import { describe, expect, it } from "vitest";

import { isMutationOriginAllowed } from "./request-security";

function request(headers: Record<string, string>) {
    return { headers: new Headers(headers), nextUrl: new URL("https://vrcx.internal/api/example") } as never;
}

describe("mutation origin checks", () => {
    it("accepts same-origin browser requests behind a proxy", () => {
        expect(isMutationOriginAllowed(request({ origin: "https://vrcx.example", "sec-fetch-site": "same-origin", "x-forwarded-host": "vrcx.example", "x-forwarded-proto": "https" }))).toBe(true);
    });

    it("rejects cross-site browser requests", () => {
        expect(isMutationOriginAllowed(request({ origin: "https://attacker.example", "sec-fetch-site": "cross-site", host: "vrcx.internal" }))).toBe(false);
    });
});
