import { describe, expect, it } from "vitest";

import { isMutationOriginAllowed } from "./request-security";

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

function request(headers: Record<string, string>) {
    return { headers: new Headers(headers), nextUrl: new URL("https://vrcx.internal/api/example") } as never;
}

async function routeFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map((entry) => {
                const path = join(directory, entry.name);
                return entry.isDirectory() ? routeFiles(path) : Promise.resolve(entry.name === "route.ts" ? [path] : []);
            }),
        )
    ).flat();
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

    it("guards every API mutation handler", async () => {
        const missing: string[] = [];
        let routeCount = 0;
        let handlerCount = 0;
        for (const file of await routeFiles(join(process.cwd(), "src/app/api"))) {
            const source = await readFile(file, "utf8");
            const matches = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b/g)];
            if (matches.length) routeCount += 1;
            for (const [index, match] of matches.entries()) {
                handlerCount += 1;
                const handler = source.slice(match.index ?? 0, matches[index + 1]?.index ?? source.length);
                if (!handler.includes("isMutationOriginAllowed")) missing.push(`${relative(process.cwd(), file)}:${match[1]}`);
            }
        }
        expect(routeCount).toBe(34);
        expect(handlerCount).toBe(42);
        expect(missing).toEqual([]);
    });
});
