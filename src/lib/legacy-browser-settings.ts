import { z } from "zod";

export const legacyBrowserSettingsSchema = z
    .object({
        theme: z.enum(["dark", "light"]).optional(),
        navigationCollapsed: z.boolean().optional(),
        myAvatarsView: z.enum(["grid", "table"]).optional(),
    })
    .strict()
    .refine((settings) => Object.values(settings).some((value) => value !== undefined));

export const legacyBrowserSettingsImportSchema = z
    .object({
        format: z.literal("vrcx-web-legacy-browser-settings"),
        version: z.literal(1),
        settings: legacyBrowserSettingsSchema,
    })
    .strict();

export type LegacyBrowserSettings = z.infer<typeof legacyBrowserSettingsSchema>;
export type LegacyBrowserSettingsImport = z.infer<typeof legacyBrowserSettingsImportSchema>;
export type LegacyBrowserStorageKey = "vrcx-my-avatars-view" | "vrcx-nav-collapsed" | "vrcx-theme";

type LegacyStorageReader = Pick<Storage, "getItem">;
type LegacyStorageWriter = Pick<Storage, "removeItem">;

const storageKeyBySetting = {
    theme: "vrcx-theme",
    navigationCollapsed: "vrcx-nav-collapsed",
    myAvatarsView: "vrcx-my-avatars-view",
} as const satisfies Record<keyof LegacyBrowserSettings, LegacyBrowserStorageKey>;

export function importedLegacyBrowserStorageKeys(settings: LegacyBrowserSettings): LegacyBrowserStorageKey[] {
    return (Object.keys(storageKeyBySetting) as Array<keyof LegacyBrowserSettings>).filter((setting) => settings[setting] !== undefined).map((setting) => storageKeyBySetting[setting]);
}

export function readLegacyBrowserSettings(storage: LegacyStorageReader): LegacyBrowserSettingsImport | null {
    const theme = storage.getItem("vrcx-theme");
    const navigationCollapsed = storage.getItem("vrcx-nav-collapsed");
    const myAvatarsView = storage.getItem("vrcx-my-avatars-view");
    const settings: LegacyBrowserSettings = {
        ...(theme === "dark" || theme === "light" ? { theme } : {}),
        ...(navigationCollapsed === "true" || navigationCollapsed === "false" ? { navigationCollapsed: navigationCollapsed === "true" } : {}),
        ...(myAvatarsView === "grid" || myAvatarsView === "table" ? { myAvatarsView } : {}),
    };
    if (!Object.keys(settings).length) return null;
    return { format: "vrcx-web-legacy-browser-settings", version: 1, settings };
}

export function clearImportedLegacyBrowserSettings(storage: LegacyStorageWriter, settings: LegacyBrowserSettings): void {
    for (const key of importedLegacyBrowserStorageKeys(settings)) storage.removeItem(key);
}
