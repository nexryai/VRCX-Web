import { vrchatMediaSources } from "./browser-url";

export type SecurityHeader = {
    key: string;
    value: string;
};

/**
 * Next.js emits inline bootstrap scripts and this UI uses React style
 * attributes, so the static policy follows Next.js's documented non-nonce
 * baseline. Development alone needs eval for React diagnostics.
 */
export function buildContentSecurityPolicy(development: boolean): string {
    const scriptSources = ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])];
    return [
        "default-src 'self'",
        `script-src ${scriptSources.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' blob: data: ${vrchatMediaSources.join(" ")}`,
        "font-src 'self' data:",
        "connect-src 'self'",
        "media-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join("; ");
}

export function buildSecurityHeaders(development: boolean): SecurityHeader[] {
    return [
        { key: "Content-Security-Policy", value: buildContentSecurityPolicy(development) },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "browsing-topics=(), camera=(), geolocation=(), hid=(), microphone=(), payment=(), serial=(), usb=()" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "X-Frame-Options", value: "DENY" },
    ];
}
