import { type NextRequest, NextResponse } from "next/server";

import { serializeAppSettings } from "@/lib/app-settings";
import { legacyBrowserSettingsImportSchema } from "@/lib/legacy-browser-settings";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { getLegacyBrowserSettingsImportStatus, importLegacyBrowserSettings } from "@/lib/mongodb/legacy-browser-settings-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";

export async function GET() {
    const status = await getLegacyBrowserSettingsImportStatus();
    const response = NextResponse.json({ ...status, importedAt: status.importedAt?.toISOString() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const legacyImport = legacyBrowserSettingsImportSchema.safeParse(await request.json().catch(() => null));
    if (!legacyImport.success) return NextResponse.json({ error: "The legacy browser settings are invalid or unsupported." }, { status: 400 });
    if (!(await importLegacyBrowserSettings(legacyImport.data.settings))) {
        const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
        return NextResponse.json({ error: "Legacy browser settings were already imported.", settings: serializeAppSettings(settings), status: await getLegacyBrowserSettingsImportStatus() }, { status: 409 });
    }
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    return NextResponse.json({ settings: serializeAppSettings(settings), status: await getLegacyBrowserSettingsImportStatus() });
}
