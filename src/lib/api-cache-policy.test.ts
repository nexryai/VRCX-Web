import { describe, expect, it } from "vitest";

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

async function routeFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? routeFiles(path) : Promise.resolve(entry.name === "route.ts" ? [path] : []);
        }),
    );
    return nested.flat();
}

describe("authenticated API cache policy", () => {
    it("makes every GET route explicitly non-cacheable", async () => {
        const apiRoot = join(process.cwd(), "src/app/api");
        const missing: string[] = [];
        let getRoutes = 0;
        for (const file of await routeFiles(apiRoot)) {
            const source = await readFile(file, "utf8");
            if (!/export async function GET\b/.test(source)) continue;
            getRoutes += 1;
            if (!/Cache-Control["']\s*[:,]\s*["'](?:private,\s*)?no-store["']/.test(source)) missing.push(relative(process.cwd(), file));
        }
        expect(getRoutes).toBe(39);
        expect(missing).toEqual([]);
    });
});
