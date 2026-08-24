import { describe, expect, it } from "vitest";

import { appSettingsBackupSchema, appSettingsUpdateSchema, serializeAppSettings } from "./app-settings";

describe("application settings boundary", () => {
    it("serializes complete browser-safe defaults", () => {
        expect(serializeAppSettings()).toMatchObject({
            theme: "dark",
            navigationCollapsed: false,
            favoriteSortByDate: false,
            localFavoriteFriendsGroups: [],
            recentActionCooldownEnabled: false,
            recentActionCooldownMinutes: 60,
            browserNotificationsEnabled: false,
            notificationLayout: "notification-center",
            notificationDeliveryFilters: expect.objectContaining({ invite: "Friends", Online: "VIP" }),
            activityTablePageSize: 20,
            avatarAutoCleanupDays: 0,
            mutualGraphLayoutIterations: 800,
            mutualGraphExcludedFriendIds: [],
        });
    });

    it("rejects unknown and server-owned fields", () => {
        expect(appSettingsUpdateSchema.safeParse({ theme: "light", activeUserId: "usr_00000000-0000-0000-0000-000000000001" }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ theme: "light", encryptedCookies: "secret" }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ avatarAutoCleanupDays: 7 }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ localFavoriteFriendsGroups: ["friend:group_0", "friend:group_0"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ localFavoriteFriendsGroups: ["world:group_0"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ localFavoriteFriendsGroups: [`friend:${"a".repeat(81)}`] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ recentActionCooldownMinutes: 0 }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ recentActionCooldownMinutes: 1_441 }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ browserNotificationsEnabled: true }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ notificationLayout: "notification-center" }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ notificationLayout: "sheet" }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ notificationDeliveryFilters: serializeAppSettings().notificationDeliveryFilters }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ notificationDeliveryFilters: { invite: "Friends" } }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ localFavoriteFriendsGroups: ["friend:group_0", "local:lfg_00000000-0000-0000-0000-000000000001"] }).success).toBe(true);
    });

    it("accepts only the versioned settings backup format", () => {
        const valid = { format: "vrcx-web-settings", version: 1, exportedAt: "2026-08-02T12:00:00.000Z", settings: serializeAppSettings({ theme: "light" }) };
        expect(appSettingsBackupSchema.safeParse(valid).success).toBe(true);
        expect(appSettingsBackupSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
    });
});
