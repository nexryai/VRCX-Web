import { type NextRequest, NextResponse } from "next/server";

import { appSettingsBackupSchema, serializeAppSettings } from "@/lib/app-settings";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { isMutationOriginAllowed } from "@/lib/request-security";

export async function GET() {
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    const backup = {
        format: "vrcx-web-settings" as const,
        version: 1 as const,
        exportedAt: new Date().toISOString(),
        settings: serializeAppSettings(settings),
    };
    const response = NextResponse.json(backup);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Content-Disposition", `attachment; filename="vrcx-web-settings-${backup.exportedAt.slice(0, 10)}.json"`);
    return response;
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const backup = appSettingsBackupSchema.safeParse(await request.json().catch(() => null));
    if (!backup.success) return NextResponse.json({ error: "The settings backup is invalid or unsupported." }, { status: 400 });
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).appSettings.updateOne({ _id: "singleton" }, { $set: { ...backup.data.settings, updatedAt: new Date() } });
    return NextResponse.json({ settings: backup.data.settings });
}
