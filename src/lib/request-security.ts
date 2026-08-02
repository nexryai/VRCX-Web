import type { NextRequest } from "next/server";

/**
 * Blocks browser cross-site mutations while retaining support for trusted
 * non-browser operators that do not send Fetch Metadata or Origin headers.
 */
export function isMutationOriginAllowed(request: NextRequest) {
    const fetchSite = request.headers.get("sec-fetch-site");
    // Fetch Metadata is set by browsers from the real client-side origin. Trust
    // that signal before proxy headers, which can describe an internal host
    // when a deployment does not preserve X-Forwarded-Host.
    if (fetchSite === "same-origin" || fetchSite === "none") return true;
    if (fetchSite) return false;

    // Older browsers and non-browser clients may omit Fetch Metadata. Retain an
    // Origin comparison for those requests instead of weakening the fallback.
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
