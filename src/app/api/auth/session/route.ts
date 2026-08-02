import { type NextRequest, NextResponse } from "next/server";

import { VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatCookies, fetchVrchatSession, readVrchatCookies } from "@/lib/vrchat/session";

export async function GET(request: NextRequest) {
    try {
        const session = await fetchVrchatSession(readVrchatCookies(request.cookies));
        const response = NextResponse.json(session);
        if (session.status === "anonymous") {
            clearVrchatCookies(response);
        }
        response.headers.set("Cache-Control", "no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat session could not be checked.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        return NextResponse.json({ error: message }, { status });
    }
}
