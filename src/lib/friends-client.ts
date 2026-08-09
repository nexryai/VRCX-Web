import { type FriendListUser, friendListResponseSchema } from "./friend-list";

export async function fetchFriendPage(offline: boolean, offset: number, signal: AbortSignal) {
    const response = await fetch(`/api/friends?offline=${offline}&n=100&offset=${offset}`, {
        cache: "no-store",
        signal,
    });
    const rawPayload: unknown = await response.json();
    const payload = friendListResponseSchema.safeParse(rawPayload);
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok || !payload.success) {
        const error = rawPayload && typeof rawPayload === "object" && "error" in rawPayload && typeof rawPayload.error === "string" ? rawPayload.error : "The friend list could not be loaded.";
        throw new Error(error);
    }
    return payload.data.friends;
}

/**
 * Mirrors VRCX's paged friend refresh while keeping requests sequential. Most
 * accounts finish in one or two pages, and sequential fetching avoids bursts
 * against VRChat's rate limits.
 */
export async function fetchAllFriends(offline: boolean, signal: AbortSignal) {
    const result: FriendListUser[] = [];
    for (let offset = 0; offset <= 7500; offset += 100) {
        const page = await fetchFriendPage(offline, offset, signal);
        result.push(...page);
        if (page.length < 100) break;
    }
    return result;
}
