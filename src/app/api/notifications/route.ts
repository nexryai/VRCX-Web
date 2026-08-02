import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { listActiveNotifications } from "@/lib/notifications/repository";

const querySchema = z.object({
    source: z.enum(["legacy", "v2", "hidden"]),
    offset: z.coerce.number().int().min(0).max(5_000).default(0),
});

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse({
        source: request.nextUrl.searchParams.get("source"),
        offset: request.nextUrl.searchParams.get("offset") || 0,
    });
    if (!query.success) return NextResponse.json({ error: "The notification query is invalid." }, { status: 400 });

    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    if (!settings?.activeUserId) return NextResponse.json({ error: "VRChat authentication is required." }, { status: 401 });
    const notifications = await listActiveNotifications(settings.activeUserId, query.data.source, query.data.offset);
    const response = NextResponse.json({ notifications });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
