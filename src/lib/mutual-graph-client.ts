import type { VrchatUser } from "@/lib/vrchat/types";
import type { MutualGraphSnapshot } from "./mutual-graph";

function delay(milliseconds: number) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchMutualPage(userId: string, offset: number, signal: AbortSignal) {
    let lastError = "Mutual friends could not be loaded.";
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`/api/users/${userId}/mutuals?offset=${offset}`, { cache: "no-store", signal });
        const payload = (await response.json()) as { error?: string; mutuals?: VrchatUser[] };
        if (response.status === 401) throw Object.assign(new Error("The VRChat session expired."), { status: 401 });
        if (response.ok && payload.mutuals) return payload.mutuals;
        lastError = payload.error || lastError;
        if (response.status !== 429) throw Object.assign(new Error(lastError), { status: response.status });
        await delay(500 * 2 ** attempt);
    }
    throw new Error(lastError);
}

export async function fetchAndPersistMutualGraph(friends: VrchatUser[], signal: AbortSignal, onProgress?: (processed: number) => void) {
    const relationships: Record<string, string[]> = {};
    const optedOut: string[] = [];
    for (let index = 0; index < friends.length; index += 1) {
        const friend = friends[index];
        if (signal.aborted) throw new DOMException("The request was aborted.", "AbortError");
        const mutualIds: string[] = [];
        try {
            for (let offset = 0; offset <= 5_000; offset += 100) {
                const page = await fetchMutualPage(friend.id, offset, signal);
                mutualIds.push(...page.map((user) => user.id).filter((id) => id !== "usr_00000000-0000-0000-0000-000000000000"));
                if (page.length < 100) break;
                await delay(210);
            }
            relationships[friend.id] = Array.from(new Set(mutualIds));
        } catch (error) {
            if (signal.aborted) throw error;
            const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
            if (status === 403 || status === 404) optedOut.push(friend.id);
            else throw error;
        }
        onProgress?.(index + 1);
        await delay(210);
    }
    const snapshot: MutualGraphSnapshot = { relationships, optedOut, updatedAt: new Date().toISOString() };
    const response = await fetch("/api/mutual-graph", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot), signal });
    return { snapshot, persisted: response.ok };
}
