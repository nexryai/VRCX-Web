import { describe, expect, it } from "vitest";

import { safeExternalHttpUrl, safeVrchatMediaUrl, vrchatMediaSources } from "./browser-url";

describe("browser URL boundaries", () => {
    it.each(vrchatMediaSources)("allows the authoritative VRChat media origin %s", (origin) => {
        expect(safeVrchatMediaUrl(`${origin}/api/1/image/file_example/1/256`)).toBe(`${origin}/api/1/image/file_example/1/256`);
    });

    it.each([
        "http://api.vrchat.cloud/api/1/image/file_example/1/256",
        "https://api.vrchat.cloud.evil.example/image.png",
        "https://api.vrchat.cloud:444/image.png",
        "https://user@api.vrchat.cloud/image.png",
        "https://127.0.0.1/image.png",
        "https://example.com/image.png",
        "data:image/svg+xml,<svg/>",
        "javascript:alert(1)",
        "/relative/image.png",
        "not a URL",
    ])("rejects automatic media loading from %s", (value) => {
        expect(safeVrchatMediaUrl(value)).toBe("");
    });

    it("allows explicit HTTP(S) navigation without embedded credentials", () => {
        expect(safeExternalHttpUrl("https://example.com/path")).toBe("https://example.com/path");
        expect(safeExternalHttpUrl("http://example.com/path")).toBe("http://example.com/path");
        expect(safeExternalHttpUrl("https://user:secret@example.com/path")).toBe("");
        expect(safeExternalHttpUrl("javascript:alert(1)")).toBe("");
    });
});
