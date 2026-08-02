import { type NextRequest, NextResponse } from "next/server";

import { appSettingsUpdateSchema, serializeAppSettings } from "@/lib/app-settings";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { isMutationOriginAllowed } from "@/lib/request-security";

export async function GET() {
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    const response = NextResponse.json(serializeAppSettings(settings));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function PATCH(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = appSettingsUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The settings update is invalid." }, { status: 400 });
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).appSettings.updateOne({ _id: "singleton" }, { $set: { ...body.data, updatedAt: new Date() } });
    return NextResponse.json({ success: true });
}
