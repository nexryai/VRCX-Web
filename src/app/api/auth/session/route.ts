import { type NextRequest, NextResponse } from "next/server";

import { VrchatApiError } from "@/lib/vrchat/client";
import { clearLegacyVrchatCookies, fetchVrchatSession } from "@/lib/vrchat/session";

export async function GET(_request: NextRequest) {
    try {
        const session = await fetchVrchatSession();
        const response = NextResponse.json(session);
        if (session.status === "anonymous") {
            clearLegacyVrchatCookies(response);
        }
        response.headers.set("Cache-Control", "no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat session could not be checked.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        return NextResponse.json({ error: message }, { status });
    }
}
