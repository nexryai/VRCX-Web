import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./security-headers";

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

async function sourceFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map((entry) => {
                const path = join(directory, entry.name);
                return entry.isDirectory() ? sourceFiles(path) : Promise.resolve(/\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : []);
            }),
        )
    ).flat();
}

describe("browser security boundary", () => {
    it("emits a production CSP without development eval", () => {
        const policy = buildContentSecurityPolicy(false);
        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("script-src 'self' 'unsafe-inline'");
        expect(policy).not.toContain("'unsafe-eval'");
        expect(policy).toContain("connect-src 'self'");
        expect(policy).toContain("img-src 'self' blob: data: https://api.vrchat.cloud https://files.vrchat.cloud https://assets.vrchat.com");
        expect(policy).not.toMatch(/img-src[^;]*\shttps:(?:\s|;|$)/);
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("frame-src 'none'");
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).toContain("base-uri 'self'");
        expect(policy).toContain("form-action 'self'");
    });

    it("allows React development diagnostics only outside production", () => {
        expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
    });

    it("applies the complete header set to every route", async () => {
        const expected = buildSecurityHeaders(process.env.NODE_ENV === "development");
        const rules = await nextConfig.headers?.();
        expect(rules).toEqual([{ source: "/:path*", headers: expected }]);
        expect(expected.map((header) => header.key)).toEqual(["Content-Security-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-DNS-Prefetch-Control", "X-Frame-Options"]);
        expect(nextConfig.experimental?.serverActions).toBeUndefined();
        expect(nextConfig.output).toBeUndefined();
    });

    it("binds the default production command to loopback", async () => {
        const manifest = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> };
        expect(manifest.scripts?.start).toBe("next start --hostname 127.0.0.1");
    });

    it("keeps raw HTML execution and secret environment access out of client modules", async () => {
        const violations: string[] = [];
        for (const file of await sourceFiles(join(process.cwd(), "src"))) {
            if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
            const source = await readFile(file, "utf8");
            const name = relative(process.cwd(), file);
            if (/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/.test(source)) violations.push(`${name}:raw-execution`);
            if (/^[\s\n]*["']use client["'];/m.test(source) && /process\.env|MONGODB_URI|VRCHAT_SESSION_ENCRYPTION_KEY/.test(source)) violations.push(`${name}:client-secret-boundary`);
        }
        expect(violations).toEqual([]);
    });

    it("routes every remote media element through the VRChat URL boundary", async () => {
        const violations: string[] = [];
        for (const file of await sourceFiles(join(process.cwd(), "src"))) {
            if (/\.test\.[cm]?[jt]sx?$/.test(file) || file.endsWith(join("components", "vrchat-image.tsx"))) continue;
            const source = await readFile(file, "utf8");
            if (/<(?:img|image)\b/.test(source)) violations.push(relative(process.cwd(), file));
        }
        expect(violations).toEqual([]);
    });

    it("keeps direct diagnostic output out of production application modules", async () => {
        const violations: string[] = [];
        for (const file of await sourceFiles(join(process.cwd(), "src"))) {
            if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
            const source = await readFile(file, "utf8");
            if (/\bconsole\.(?:debug|error|info|log|warn)\s*\(|process\.(?:stderr|stdout)\.write\s*\(/.test(source)) violations.push(relative(process.cwd(), file));
        }
        expect(violations).toEqual([]);
    });
});
