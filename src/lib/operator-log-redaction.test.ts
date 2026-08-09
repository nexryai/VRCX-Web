import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../scripts/lib/redact-secrets.mjs";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("operator log redaction", () => {
    it("removes exact connection strings and encryption keys", () => {
        const uri = "mongodb://operator:encoded%40password@db.internal:27017/vrcx";
        const key = "base64-session-encryption-key-example";
        expect(redactSecrets(`database=${uri} key=${key}`, [uri, key])).toBe("database=[redacted] key=[redacted]");
    });

    it.each([
        ["mongodb+srv://operator:encoded%40password@cluster.example/vrcx", "mongodb+srv://[redacted]@cluster.example/vrcx"],
        ["mongodb://operator:decoded@password@db.internal/vrcx", "mongodb://[redacted]@db.internal/vrcx"],
        ["https://operator:password@example.com/path", "https://[redacted]@example.com/path"],
        ["Authorization: Basic dXNlcjpwYXNzd29yZA==", "Authorization: Basic [redacted]"],
        ["Authorization=Bearer header.payload.signature", "Authorization=Bearer [redacted]"],
        ['Authorization: "Basic dXNlcjpwYXNzd29yZA=="', 'Authorization: "Basic [redacted]"'],
        ["Cookie: auth=session-cookie; twoFactorAuth=second-cookie", "Cookie: auth=[redacted]; twoFactorAuth=[redacted]"],
        ['payload={"auth":"session-cookie","twoFactorAuth":"second-cookie"}', 'payload={"auth":"[redacted]","twoFactorAuth":"[redacted]"}'],
        ["payload={ auth: 'session-cookie', twoFactorAuth: 'second-cookie' }", 'payload={ auth: "[redacted]", twoFactorAuth: "[redacted]" }'],
        ["MONGODB_URI=mongodb://db.internal/vrcx", "MONGODB_URI=[redacted]"],
        ["VRCHAT_SESSION_ENCRYPTION_KEY=base64-value", "VRCHAT_SESSION_ENCRYPTION_KEY=[redacted]"],
        ["https://example.com/callback?token=secret&state=visible", "https://example.com/callback?token=[redacted]&state=visible"],
    ])("structurally redacts %s", (input, expected) => {
        expect(redactSecrets(input)).toBe(expected);
    });

    it("preserves useful non-secret diagnostics", () => {
        expect(redactSecrets("MongoDB connection refused at db.internal:27017 after 15000ms")).toBe("MongoDB connection refused at db.internal:27017 after 15000ms");
    });

    it("keeps both operator smoke scripts behind the shared boundary", async () => {
        for (const file of ["mongodb-backup-smoke.mjs", "monitor-restart-smoke.mjs"]) {
            const source = await readFile(join(process.cwd(), "scripts", file), "utf8");
            expect(source).toContain('import { redactOperatorSecrets } from "./lib/redact-secrets.mjs";');
            expect(source).not.toContain("function redactSecrets");
            expect(source).not.toMatch(/process\.stderr\.write\((?![^\n]*redactOperatorSecrets)/);
        }
    });
});
