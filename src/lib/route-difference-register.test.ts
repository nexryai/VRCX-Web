import { describe, expect, it } from "vitest";

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function pageFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map((entry) => {
                const path = join(directory, entry.name);
                return entry.isDirectory() ? pageFiles(path) : Promise.resolve(entry.name === "page.tsx" ? [path] : []);
            }),
        )
    ).flat();
}

function routeForPage(appRoot: string, file: string) {
    const segments = relative(appRoot, file)
        .split(sep)
        .slice(0, -1)
        .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
    return `/${segments.join("/")}`;
}

describe("VRCX route difference register", () => {
    it("covers every shipped Next.js page exactly once", async () => {
        const appRoot = join(process.cwd(), "src/app");
        const shippedRoutes = (await pageFiles(appRoot)).map((file) => routeForPage(appRoot, file)).toSorted();
        const document = await readFile(join(process.cwd(), "docs/vrcx-route-difference-register.md"), "utf8");
        const register = document.split("<!-- ROUTE_REGISTER_START -->")[1]?.split("<!-- ROUTE_REGISTER_END -->")[0] || "";
        const documentedRoutes = [...register.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]).toSorted();

        expect(documentedRoutes).toEqual(shippedRoutes);
        expect(new Set(documentedRoutes).size).toBe(documentedRoutes.length);
    });

    it("keeps every product page reachable and every linked local source real", async () => {
        const appRoot = join(process.cwd(), "src/app");
        const productRoutes = (await pageFiles(appRoot)).map((file) => routeForPage(appRoot, file)).filter((route) => !["/", "/login"].includes(route));
        const shell = await readFile(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
        const linkedRoutes = new Set([...shell.matchAll(/(?:href:|href=)[ ]*"([^"]+)"/g)].map((match) => match[1]));
        expect(productRoutes.filter((route) => !linkedRoutes.has(route))).toEqual([]);

        const document = await readFile(join(process.cwd(), "docs/vrcx-route-difference-register.md"), "utf8");
        const localLinks = [...document.matchAll(/\]\(\.\.\/((?:VRCX|src)\/[^)#]+)\)/g)].map((match) => match[1]);
        const missing: string[] = [];
        for (const path of localLinks) {
            try {
                await readFile(join(process.cwd(), path));
            } catch {
                missing.push(path);
            }
        }
        expect(missing).toEqual([]);
    });
});
