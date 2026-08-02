import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { isMutationOriginAllowed } from "@/lib/request-security";

const updateSchema = z
    .object({
        theme: z.enum(["dark", "light"]).optional(),
        navigationCollapsed: z.boolean().optional(),
        myAvatarsView: z.enum(["grid", "table"]).optional(),
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
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined));

export async function GET() {
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    const response = NextResponse.json({
        theme: settings?.theme ?? "dark",
        navigationCollapsed: settings?.navigationCollapsed ?? false,
        myAvatarsView: settings?.myAvatarsView ?? "grid",
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
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function PATCH(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The settings update is invalid." }, { status: 400 });
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).appSettings.updateOne({ _id: "singleton" }, { $set: { ...body.data, updatedAt: new Date() } });
    return NextResponse.json({ success: true });
}
