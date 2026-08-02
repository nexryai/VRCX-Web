import { z } from "zod";

export const vrchatUserSchema = z
    .object({
        id: z.string(),
        displayName: z.string(),
        username: z.string().optional(),
        userIcon: z.string().optional(),
        profilePicOverride: z.string().optional(),
        currentAvatarImageUrl: z.string().optional(),
        currentAvatarThumbnailImageUrl: z.string().optional(),
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
