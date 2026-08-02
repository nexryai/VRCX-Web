import type { VrchatUser } from "./vrchat/types";

export async function fetchFriendPage(offline: boolean, offset: number, signal: AbortSignal) {
    const response = await fetch(`/api/friends?offline=${offline}&n=100&offset=${offset}`, {
        cache: "no-store",
        signal,
    });
    const payload = (await response.json()) as { error?: string; friends?: VrchatUser[] };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok || !payload.friends) {
        throw new Error(payload.error || "The friend list could not be loaded.");
    }
    return payload.friends;
}

/**
 * Mirrors VRCX's paged friend refresh while keeping requests sequential. Most
 * accounts finish in one or two pages, and sequential fetching avoids bursts
 * against VRChat's rate limits.
 */
export async function fetchAllFriends(offline: boolean, signal: AbortSignal) {
    const result: VrchatUser[] = [];
    for (let offset = 0; offset <= 7500; offset += 100) {
        const page = await fetchFriendPage(offline, offset, signal);
        result.push(...page);
        if (page.length < 100) break;
    }
    return result;
}
