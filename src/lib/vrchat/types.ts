import { z } from "zod";

export const vrchatUserSchema = z
    .object({
        id: z.string(),
        displayName: z.string(),
        username: z.string().optional(),
        userIcon: z.string().optional(),
        profilePicOverride: z.string().optional(),
        bannerUrl: z.string().optional(),
        bannerColor: z.string().optional(),
        bannerType: z.string().optional(),
        currentAvatarImageUrl: z.string().optional(),
        currentAvatarThumbnailImageUrl: z.string().optional(),
        currentAvatar: z.string().optional(),
        hasSharedConnectionsOptOut: z.boolean().optional(),
        bio: z.string().optional(),
        bioLinks: z.array(z.string()).optional(),
        date_joined: z.string().optional(),
        last_login: z.string().optional(),
        last_activity: z.string().optional(),
        isFriend: z.boolean().optional(),
        note: z.string().optional(),
        pronouns: z.string().optional(),
        badges: z
            .array(
                z
                    .object({
                        badgeName: z.string().optional(),
                        badgeDescription: z.string().optional(),
                        badgeImageUrl: z.string().optional(),
                    })
                    .passthrough(),
            )
            .optional(),
        representedGroup: z
            .object({
                groupId: z.string().optional(),
                name: z.string().optional(),
                shortCode: z.string().optional(),
                iconUrl: z.string().optional(),
            })
            .passthrough()
            .optional(),
        travelingToLocation: z.string().optional(),
        world: z
            .object({
                id: z.string().optional(),
                name: z.string().optional(),
                thumbnailImageUrl: z.string().optional(),
            })
            .passthrough()
            .optional(),
        status: z.string().optional(),
        statusDescription: z.string().optional(),
        state: z.string().optional(),
        location: z.string().optional(),
        platform: z.string().optional(),
        last_platform: z.string().optional(),
        tags: z.array(z.string()).optional(),
    })
    .passthrough();

export type VrchatUser = z.infer<typeof vrchatUserSchema>;

export const vrchatWorldSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        authorId: z.string().optional(),
        authorName: z.string().optional(),
        thumbnailImageUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        occupants: z.number().optional(),
        capacity: z.number().optional(),
        recommendedCapacity: z.number().optional(),
        publicOccupants: z.number().optional(),
        privateOccupants: z.number().optional(),
        favorites: z.number().optional(),
        visits: z.number().optional(),
        heat: z.number().optional(),
        popularity: z.number().optional(),
        version: z.number().optional(),
        releaseStatus: z.string().optional(),
        publicationDate: z.string().optional(),
        labsPublicationDate: z.string().optional(),
        created_at: z.string().optional(),
        updated_at: z.string().optional(),
        unityPackages: z
            .array(
                z
                    .object({
                        platform: z.string(),
                        unityVersion: z.string().optional(),
                        created_at: z.string().optional(),
                    })
                    .passthrough(),
            )
            .optional(),
        instances: z.array(z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
    })
    .passthrough();

export type VrchatWorld = z.infer<typeof vrchatWorldSchema>;

export const vrchatAvatarSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        authorId: z.string().optional(),
        authorName: z.string().optional(),
        imageUrl: z.string().optional(),
        thumbnailImageUrl: z.string().optional(),
        releaseStatus: z.string().optional(),
        created_at: z.string().optional(),
        updated_at: z.string().optional(),
        favoriteGroup: z.string().optional(),
        favoriteId: z.string().optional(),
        version: z.number().optional(),
        unityPackages: z
            .array(
                z
                    .object({
                        platform: z.string(),
                        performanceRating: z.string().optional(),
                    })
                    .passthrough(),
            )
            .optional(),
        tags: z.array(z.string()).optional(),
    })
    .passthrough();

export type VrchatAvatar = z.infer<typeof vrchatAvatarSchema>;

export const vrchatFavoriteSchema = z
    .object({
        id: z.string(),
        favoriteId: z.string(),
        type: z.string(),
        tags: z.array(z.string()).default([]),
    })
    .passthrough();

export type VrchatFavorite = z.infer<typeof vrchatFavoriteSchema>;

export const vrchatFavoriteGroupSchema = z
    .object({
        id: z.string(),
        ownerId: z.string().optional(),
        ownerDisplayName: z.string().optional(),
        name: z.string(),
        displayName: z.string().optional(),
        type: z.string(),
        visibility: z.string().optional(),
        tags: z.array(z.string()).optional(),
    })
    .passthrough();

export type VrchatFavoriteGroup = z.infer<typeof vrchatFavoriteGroupSchema>;

export const vrchatFavoriteLimitsSchema = z
    .object({
        maxFavoriteGroups: z.record(z.string(), z.number()).optional(),
        maxFavoritesPerGroup: z.record(z.string(), z.number()).optional(),
    })
    .passthrough();

export type VrchatFavoriteLimits = z.infer<typeof vrchatFavoriteLimitsSchema>;

export const vrchatGroupSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        ownerId: z.string().optional(),
        shortCode: z.string().optional(),
        discriminator: z.string().optional(),
        description: z.string().optional(),
        rules: z.string().optional(),
        iconUrl: z.string().optional(),
        bannerUrl: z.string().optional(),
        memberCount: z.number().optional(),
        onlineMemberCount: z.number().optional(),
        joinState: z.string().optional(),
        privacy: z.string().optional(),
        membershipStatus: z.string().optional(),
        isVerified: z.boolean().optional(),
        createdAt: z.string().optional(),
        links: z.array(z.string()).optional(),
        languages: z.array(z.string()).optional(),
        roles: z
            .array(
                z
                    .object({
                        id: z.string(),
                        name: z.string(),
                        description: z.string().optional(),
                        permissions: z.array(z.string()).optional(),
                    })
                    .passthrough(),
            )
            .optional(),
        myMember: z
            .object({
                membershipStatus: z.string().optional(),
                visibility: z.string().optional(),
                isRepresenting: z.boolean().optional(),
                isSubscribedToAnnouncements: z.boolean().optional(),
                isSubscribedToEventAnnouncements: z.boolean().optional(),
                roleIds: z.array(z.string()).optional(),
                bannedAt: z.string().nullable().optional(),
            })
            .passthrough()
            .optional(),
    })
    .passthrough();

export type VrchatGroup = z.infer<typeof vrchatGroupSchema>;

export const vrchatGroupPostSchema = z
    .object({
        id: z.string(),
        groupId: z.string().optional(),
        title: z.string().default(""),
        text: z.string().default(""),
        imageUrl: z.string().optional(),
        authorId: z.string().optional(),
        editorId: z.string().optional(),
        roleIds: z.array(z.string()).default([]),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    })
    .passthrough();

export type VrchatGroupPost = z.infer<typeof vrchatGroupPostSchema>;

export const vrchatGroupMemberSchema = z
    .object({
        id: z.string(),
        groupId: z.string().optional(),
        userId: z.string(),
        roleIds: z.array(z.string()).default([]),
        joinedAt: z.string().optional(),
        membershipStatus: z.string().optional(),
        visibility: z.string().optional(),
        isRepresenting: z.boolean().optional(),
        isSubscribedToAnnouncements: z.boolean().optional(),
        managerNotes: z.string().optional(),
        user: vrchatUserSchema.optional(),
    })
    .passthrough();

export type VrchatGroupMember = z.infer<typeof vrchatGroupMemberSchema>;

export const vrchatPlayerModerationSchema = z
    .object({
        id: z.string().optional(),
        type: z.string(),
        sourceUserId: z.string(),
        sourceDisplayName: z.string().optional(),
        targetUserId: z.string(),
        targetDisplayName: z.string().optional(),
        created: z.string().optional(),
    })
    .passthrough();

export type VrchatPlayerModeration = z.infer<typeof vrchatPlayerModerationSchema>;

export const vrchatNotificationSchema = z
    .object({
        id: z.string(),
        type: z.string(),
        senderUserId: z.string().optional(),
        senderUsername: z.string().optional(),
        receiverUserId: z.string().optional(),
        message: z.string().optional(),
        title: z.string().optional(),
        details: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
        seen: z.boolean().optional(),
        created_at: z.union([z.string(), z.number()]).optional(),
        createdAt: z.union([z.string(), z.number()]).optional(),
        updatedAt: z.union([z.string(), z.number()]).optional(),
        expiresAt: z.union([z.string(), z.number()]).optional(),
        imageUrl: z.string().optional(),
        worldId: z.string().optional(),
        worldName: z.string().optional(),
        instanceId: z.string().optional(),
        link: z.string().optional(),
        linkText: z.string().optional(),
        groupName: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        responses: z
            .array(
                z
                    .object({
                        type: z.string(),
                        data: z.string().optional(),
                        text: z.string().optional(),
                        label: z.string().optional(),
                        icon: z.string().optional(),
                    })
                    .passthrough(),
            )
            .optional(),
    })
    .passthrough();

export type VrchatNotification = z.infer<typeof vrchatNotificationSchema> & {
    source?: "hidden" | "legacy" | "v2";
};

export const vrchatAuthResponseSchema = z
    .object({
        requiresTwoFactorAuth: z.array(z.string()).optional(),
        id: z.string().optional(),
        displayName: z.string().optional(),
    })
    .passthrough();

export type VrchatAuthResponse = z.infer<typeof vrchatAuthResponseSchema>;

export type TwoFactorMethod = "totp" | "otp" | "emailOtp";

export type SessionSnapshot = { status: "anonymous" } | { status: "two-factor-required"; methods: TwoFactorMethod[] } | { status: "authenticated"; user: VrchatUser };
