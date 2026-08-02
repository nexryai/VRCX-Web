import type { NextRequest } from "next/server";

/**
 * Blocks browser cross-site mutations while retaining support for trusted
 * non-browser operators that do not send Fetch Metadata or Origin headers.
 */
export function isMutationOriginAllowed(request: NextRequest) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

    const origin = request.headers.get("origin");
    if (!origin) return true;
    try {
        const originUrl = new URL(origin);
        const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || request.nextUrl.host;
        const expectedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
        return originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`;
    } catch {
        return false;
    }
}
