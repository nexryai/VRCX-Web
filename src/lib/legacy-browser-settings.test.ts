import { describe, expect, it } from "vitest";

import { clearImportedLegacyBrowserSettings, importedLegacyBrowserStorageKeys, legacyBrowserSettingsImportSchema, readLegacyBrowserSettings } from "./legacy-browser-settings";

function storageWith(values: Record<string, string>) {
    const removed: string[] = [];
    return {
        removed,
        getItem(key: string) {
            return values[key] ?? null;
        },
        removeItem(key: string) {
            removed.push(key);
            delete values[key];
        },
    };
}

describe("legacy root browser settings", () => {
    it("reads only the three exact historical keys and valid historical values", () => {
        const storage = storageWith({ "vrcx-theme": "light", "vrcx-nav-collapsed": "true", "vrcx-my-avatars-view": "table", unrelated: "keep" });
        expect(readLegacyBrowserSettings(storage)).toEqual({
            format: "vrcx-web-legacy-browser-settings",
            version: 1,
            settings: { theme: "light", navigationCollapsed: true, myAvatarsView: "table" },
        });
        expect(legacyBrowserSettingsImportSchema.safeParse(readLegacyBrowserSettings(storage)).success).toBe(true);
    });

    it("ignores malformed values and removes only successfully imported keys", () => {
        const storage = storageWith({ "vrcx-theme": "system", "vrcx-nav-collapsed": "false", "vrcx-my-avatars-view": "cards", unrelated: "keep" });
        const legacyImport = readLegacyBrowserSettings(storage);
        expect(legacyImport).toEqual({ format: "vrcx-web-legacy-browser-settings", version: 1, settings: { navigationCollapsed: false } });
        expect(importedLegacyBrowserStorageKeys(legacyImport?.settings ?? {})).toEqual(["vrcx-nav-collapsed"]);
        if (legacyImport) clearImportedLegacyBrowserSettings(storage, legacyImport.settings);
        expect(storage.removed).toEqual(["vrcx-nav-collapsed"]);
        expect(storage.getItem("vrcx-theme")).toBe("system");
        expect(storage.getItem("unrelated")).toBe("keep");
    });

    it("returns no payload when this browser has no compatible legacy state", () => {
        expect(readLegacyBrowserSettings(storageWith({ "vrcx-theme": "unsupported" }))).toBeNull();
        expect(legacyBrowserSettingsImportSchema.safeParse({ format: "vrcx-web-legacy-browser-settings", version: 1, settings: { activeUserId: "usr_secret" } }).success).toBe(false);
    });
});
