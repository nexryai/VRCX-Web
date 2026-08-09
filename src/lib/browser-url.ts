const vrchatMediaOrigins = new Set(["https://api.vrchat.cloud", "https://files.vrchat.cloud", "https://assets.vrchat.com"]);

function parsedUrl(value?: string | null): URL | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.username || url.password ? null : url;
    } catch {
        return null;
    }
}

/** Explicitly navigated links may use normal HTTP(S), but never active schemes. */
export function safeExternalHttpUrl(value?: string | null): string {
    const url = parsedUrl(value);
    return url && (url.protocol === "https:" || url.protocol === "http:") ? url.toString() : "";
}

/**
 * Remote media loads happen without a click and can otherwise become browser
 * request forgery. Restrict them to the three hosts VRCX itself preconnects.
 */
export function safeVrchatMediaUrl(value?: string | null): string {
    const url = parsedUrl(value);
    return url && vrchatMediaOrigins.has(url.origin) ? url.toString() : "";
}

export const vrchatMediaSources = [...vrchatMediaOrigins];
