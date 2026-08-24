import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { listActiveNotifications, listNotificationCenterNotifications } from "@/lib/notifications/repository";
import type { VrchatNotification } from "@/lib/vrchat/types";

const querySchema = z.object({
    source: z.enum(["legacy", "v2", "hidden"]),
    offset: z.coerce.number().int().min(0).max(5_000).default(0),
    scope: z.enum(["active", "center"]).default("active"),
});

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse({
        source: request.nextUrl.searchParams.get("source"),
        offset: request.nextUrl.searchParams.get("offset") || 0,
        scope: request.nextUrl.searchParams.get("scope") || "active",
    });
    if (!query.success) return NextResponse.json({ error: "The notification query is invalid." }, { status: 400 });

    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    if (!settings?.activeUserId) return NextResponse.json({ error: "VRChat authentication is required." }, { status: 401 });
    let notifications: VrchatNotification[];
    if (query.data.scope === "center") {
        if (query.data.source === "hidden") return NextResponse.json({ error: "Hidden history is not part of Notification Center." }, { status: 400 });
        const source: "legacy" | "v2" = query.data.source;
        notifications = await listNotificationCenterNotifications(settings.activeUserId, source, query.data.offset);
    } else {
        notifications = await listActiveNotifications(settings.activeUserId, query.data.source, query.data.offset);
    }
    const response = NextResponse.json({ notifications });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
