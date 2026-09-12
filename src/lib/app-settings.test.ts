import { describe, expect, it } from "vitest";

import { appSettingsBackupSchema, appSettingsUpdateSchema, serializeAppSettings } from "./app-settings";

describe("application settings boundary", () => {
    it("serializes complete browser-safe defaults", () => {
        expect(serializeAppSettings()).toMatchObject({
            theme: "dark",
            navigationCollapsed: false,
            navigationConfig: expect.objectContaining({ hiddenKeys: [] }),
            favoriteSortByDate: false,
            localFavoriteFriendsGroups: [],
            recentActionCooldownEnabled: false,
            recentActionCooldownMinutes: 60,
            browserNotificationsEnabled: false,
            notificationLayout: "notification-center",
            notificationDeliveryFilters: expect.objectContaining({ invite: "Friends", Online: "VIP" }),
            activityTablePageSize: 20,
            avatarAutoCleanupDays: 0,
            toolsCollapsedCategories: [],
            groupCalendarShowFeaturedEvents: false,
            sidebarGroupByInstance: true,
            sidebarHideGroupedFriends: false,
            sidebarSameInstanceAboveFavorites: false,
            sidebarDivideByFriendGroup: true,
            sidebarCosmetics: false,
            sidebarFavoriteGroups: [],
            sidebarFavoriteGroupOrder: [],
            sidebarSortMethods: ["Sort Private to Bottom", "Sort by Last Active"],
            mutualGraphLayoutIterations: 800,
            mutualGraphExcludedFriendIds: [],
            statusBarVisibility: { servers: true, ws: true, monitor: true, sync: true, rateLimit: true, uptime: true },
            statusBarClockCount: 2,
            isAgeGatedInstancesVisible: false,
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
        const navigation = appSettingsUpdateSchema.safeParse({
            navigationConfig: {
                layout: [
                    { type: "item", key: "feed" },
                    { type: "item", key: "feed" },
                ],
                hiddenKeys: [],
            },
        });
        expect(navigation.success && navigation.data.navigationConfig?.layout.filter((entry) => entry.type === "item" && entry.key === "feed")).toHaveLength(1);
        expect(appSettingsUpdateSchema.safeParse({ toolsCollapsedCategories: ["user"] }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ toolsCollapsedCategories: ["group", "user"], groupCalendarShowFeaturedEvents: true }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ toolsCollapsedCategories: ["user", "user"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ toolsCollapsedCategories: ["system"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ sidebarSortMethods: ["Sort by Status", "Sort by Location"] }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ sidebarSortMethods: ["Sort by Status", "Sort by Status"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ sidebarSortMethods: ["Sort by Time in Instance"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ sidebarFavoriteGroups: ["friend:group_0", "local:lfg_00000000-0000-0000-0000-000000000001"] }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ sidebarFavoriteGroupOrder: ["friend:group_0", "friend:group_0"] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ localFavoriteFriendsGroups: ["friend:group_0", "local:lfg_00000000-0000-0000-0000-000000000001"] }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ statusBarClockCount: 3, statusBarClocks: [9, 0, -5] }).success).toBe(true);
        expect(appSettingsUpdateSchema.safeParse({ statusBarClockCount: 4 }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ statusBarClocks: [15, 0, -5] }).success).toBe(false);
        expect(appSettingsUpdateSchema.safeParse({ isAgeGatedInstancesVisible: true }).success).toBe(true);
    });

    it("accepts only the versioned settings backup format", () => {
        const valid = { format: "vrcx-web-settings", version: 1, exportedAt: "2026-08-02T12:00:00.000Z", settings: serializeAppSettings({ theme: "light" }) };
        expect(appSettingsBackupSchema.safeParse(valid).success).toBe(true);
        expect(appSettingsBackupSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
    });
});
