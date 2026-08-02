import { type NextRequest, NextResponse } from "next/server";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { clearVrchatCookies } from "@/lib/vrchat/session";

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    // VRCX logs out locally by clearing its VRChat cookie container. The web
    // port mirrors that behavior without introducing a second identity layer.
    const response = NextResponse.json({ status: "anonymous" });
    clearVrchatCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
}
