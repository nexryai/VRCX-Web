import { NextResponse } from "next/server";

import { clearVrchatCookies } from "@/lib/vrchat/session";

export async function POST() {
    // VRCX logs out locally by clearing its VRChat cookie container. The web
    // port mirrors that behavior without introducing a second identity layer.
    const response = NextResponse.json({ status: "anonymous" });
    clearVrchatCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
}
