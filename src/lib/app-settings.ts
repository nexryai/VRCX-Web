import { z } from "zod";

import { userIdSchema } from "@/lib/vrchat/ids";

export const appSettingsUpdateSchema = z
    .object({
        theme: z.enum(["dark", "light"]).optional(),
        navigationCollapsed: z.boolean().optional(),
        myAvatarsView: z.enum(["grid", "table"]).optional(),
        myAvatarsCardScale: z.number().min(0.3).max(0.9).optional(),
        myAvatarsCardSpacing: z.number().min(0.5).max(1.5).optional(),
        myAvatarsTablePageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
        friendLocationCardScale: z.number().min(0.5).max(1).optional(),
        friendLocationCardSpacing: z.number().min(0.25).max(1).optional(),
        friendLocationShowSameInstance: z.boolean().optional(),
        friendLocationSegment: z.enum(["active", "favorite", "offline", "online", "same-instance"]).optional(),
        sidebarGroupByInstance: z.boolean().optional(),
        sidebarCollapsedSections: z
            .array(z.enum(["active", "favorite", "me", "offline", "online"]))
            .max(5)
            .optional(),
        sidebarTab: z.enum(["friends", "groups"]).optional(),
        feedFilters: z
            .array(z.enum(["GPS", "Online", "Offline", "Status", "Avatar", "Bio"]))
            .max(6)
            .optional(),
        feedFavoritesOnly: z.boolean().optional(),
        friendLogFilters: z
            .array(z.enum(["Friend", "Unfriend", "FriendRequest", "DisplayName", "TrustLevel"]))
            .max(5)
            .optional(),
        activityTablePageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
        friendListTablePageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
        userDialogLastTab: z.enum(["Info", "Mutual", "Groups", "Worlds", "Activity", "JSON"]).optional(),
        notificationFilters: z.array(z.string().min(1).max(64)).max(32).optional(),
        notificationTablePageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
        favoriteSortByDate: z.boolean().optional(),
        favoriteCardScale: z.object({ avatar: z.number().min(0.6).max(1), friend: z.number().min(0.6).max(1), world: z.number().min(0.6).max(1) }).optional(),
        favoriteCardSpacing: z.object({ avatar: z.number().min(0.5).max(1.5), friend: z.number().min(0.5).max(1.5), world: z.number().min(0.5).max(1.5) }).optional(),
        moderationFilters: z.array(z.string().min(1).max(64)).max(32).optional(),
        moderationTablePageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
        mutualGraphLayoutIterations: z.number().int().min(300).max(1_500).optional(),
        mutualGraphLayoutSpacing: z.number().int().min(8).max(240).optional(),
        mutualGraphEdgeCurvature: z.number().min(0).max(0.2).optional(),
        mutualGraphCommunitySeparation: z.number().min(0).max(3).optional(),
        mutualGraphExcludedFriendIds: z.array(userIdSchema).max(10_000).optional(),
        avatarAutoCleanupDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).optional(),
    })
    .strict()
    .refine((value) => Object.values(value).some((item) => item !== undefined));

export const appSettingsBackupSchema = z
    .object({
        format: z.literal("vrcx-web-settings"),
        version: z.literal(1),
        exportedAt: z.iso.datetime(),
        settings: appSettingsUpdateSchema,
    })
    .strict();

export type AppSettingsPayload = z.infer<typeof appSettingsUpdateSchema>;

export function serializeAppSettings(settings?: Partial<AppSettingsPayload> | null): AppSettingsPayload {
    return {
        theme: settings?.theme ?? "dark",
        navigationCollapsed: settings?.navigationCollapsed ?? false,
        myAvatarsView: settings?.myAvatarsView ?? "grid",
        myAvatarsCardScale: settings?.myAvatarsCardScale ?? 0.6,
        myAvatarsCardSpacing: settings?.myAvatarsCardSpacing ?? 1,
        myAvatarsTablePageSize: settings?.myAvatarsTablePageSize ?? 20,
        friendLocationCardScale: settings?.friendLocationCardScale ?? 1,
        friendLocationCardSpacing: settings?.friendLocationCardSpacing ?? 1,
        friendLocationShowSameInstance: settings?.friendLocationShowSameInstance ?? false,
        friendLocationSegment: settings?.friendLocationSegment ?? "online",
        sidebarGroupByInstance: settings?.sidebarGroupByInstance ?? false,
        sidebarCollapsedSections: settings?.sidebarCollapsedSections ?? [],
        sidebarTab: settings?.sidebarTab ?? "friends",
        feedFilters: settings?.feedFilters ?? [],
        feedFavoritesOnly: settings?.feedFavoritesOnly ?? false,
        friendLogFilters: settings?.friendLogFilters ?? [],
        activityTablePageSize: settings?.activityTablePageSize ?? 20,
        friendListTablePageSize: settings?.friendListTablePageSize ?? 20,
        userDialogLastTab: settings?.userDialogLastTab ?? "Info",
        notificationFilters: settings?.notificationFilters ?? [],
        notificationTablePageSize: settings?.notificationTablePageSize ?? 20,
        favoriteSortByDate: settings?.favoriteSortByDate ?? false,
        favoriteCardScale: settings?.favoriteCardScale ?? { avatar: 1, friend: 1, world: 1 },
        favoriteCardSpacing: settings?.favoriteCardSpacing ?? { avatar: 1, friend: 1, world: 1 },
        moderationFilters: settings?.moderationFilters ?? [],
        moderationTablePageSize: settings?.moderationTablePageSize ?? 20,
        mutualGraphLayoutIterations: settings?.mutualGraphLayoutIterations ?? 800,
        mutualGraphLayoutSpacing: settings?.mutualGraphLayoutSpacing ?? 60,
        mutualGraphEdgeCurvature: settings?.mutualGraphEdgeCurvature ?? 0.1,
        mutualGraphCommunitySeparation: settings?.mutualGraphCommunitySeparation ?? 0,
        mutualGraphExcludedFriendIds: settings?.mutualGraphExcludedFriendIds ?? [],
        avatarAutoCleanupDays: settings?.avatarAutoCleanupDays ?? 0,
    };
}
