import { type NextRequest, NextResponse } from "next/server";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { clearCurrentVrchatSession, clearLegacyVrchatCookies } from "@/lib/vrchat/session";

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    await clearCurrentVrchatSession();
    const response = NextResponse.json({ status: "anonymous" });
    clearLegacyVrchatCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
}
