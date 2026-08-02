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
