import "server-only";

import type { LegacyBrowserSettings, LegacyBrowserStorageKey } from "@/lib/legacy-browser-settings";
import { importedLegacyBrowserStorageKeys } from "@/lib/legacy-browser-settings";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export type LegacyBrowserSettingsImportStatus = {
    completed: boolean;
    importedAt?: Date;
    importedKeys: LegacyBrowserStorageKey[];
    version: 1;
};

export async function getLegacyBrowserSettingsImportStatus(): Promise<LegacyBrowserSettingsImportStatus> {
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" }, { projection: { legacyBrowserSettingsImportVersion: 1, legacyBrowserSettingsImportedAt: 1, legacyBrowserSettingsImportedKeys: 1 } });
    return {
        version: 1,
        completed: settings?.legacyBrowserSettingsImportVersion === 1,
        importedAt: settings?.legacyBrowserSettingsImportedAt,
        importedKeys: settings?.legacyBrowserSettingsImportedKeys ?? [],
    };
}

export async function importLegacyBrowserSettings(settings: LegacyBrowserSettings, importedAt = new Date()): Promise<boolean> {
    await ensureMongoSchema();
    const result = await collections(await getMongoDatabase()).appSettings.updateOne(
        { _id: "singleton", legacyBrowserSettingsImportVersion: 0 },
        {
            $set: {
                ...settings,
                legacyBrowserSettingsImportVersion: 1,
                legacyBrowserSettingsImportedAt: importedAt,
                legacyBrowserSettingsImportedKeys: importedLegacyBrowserStorageKeys(settings),
                updatedAt: importedAt,
            },
        },
    );
    return result.modifiedCount === 1;
}
