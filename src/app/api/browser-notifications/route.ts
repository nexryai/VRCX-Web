import { type NextRequest, NextResponse } from "next/server";

import { claimBrowserNotifications } from "@/lib/mongodb/browser-notifications-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { VrchatApiError } from "@/lib/vrchat/client";

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    try {
        return NextResponse.json({ notifications: await claimBrowserNotifications(await requireActiveUserId()) });
    } catch (error) {
        if (error instanceof VrchatApiError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: "Browser notifications could not be claimed." }, { status: 500 });
    }
}
