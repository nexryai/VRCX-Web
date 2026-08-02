import type { VrchatUser } from "@/lib/vrchat/types";
import type { MutualGraphSnapshot } from "./mutual-graph";

type MutualJob = { status: "cancelled" | "complete" | "error" | "running"; processed: number; total: number; error?: string };

function delay(milliseconds: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, milliseconds);
        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timeout);
                reject(new DOMException("The request was aborted.", "AbortError"));
            },
            { once: true },
        );
    });
}

async function runMutualGraphJob(signal: AbortSignal, onProgress?: (processed: number) => void, friendId?: string) {
    const start = await fetch("/api/mutual-graph", {
        method: "POST",
        headers: friendId ? { "Content-Type": "application/json" } : undefined,
        body: friendId ? JSON.stringify({ friendId }) : undefined,
        signal,
    });
    if (start.status === 401) throw Object.assign(new Error("The VRChat session expired."), { status: 401 });
    if (!start.ok && start.status !== 409) throw new Error("The mutual graph job could not be started.");
    while (!signal.aborted) {
        const response = await fetch("/api/mutual-graph", { cache: "no-store", signal });
        const payload = (await response.json()) as { snapshot?: MutualGraphSnapshot | null; job?: MutualJob; error?: string };
        if (response.status === 401) throw Object.assign(new Error("The VRChat session expired."), { status: 401 });
        if (!response.ok || !payload.job) throw new Error(payload.error || "The mutual graph status could not be loaded.");
        onProgress?.(payload.job.processed);
        if (payload.job.status === "complete" && payload.snapshot) return { snapshot: payload.snapshot, persisted: true };
        if (payload.job.status === "error") throw new Error(payload.job.error || "The mutual graph job failed.");
        if (payload.job.status === "cancelled") throw new DOMException("The request was aborted.", "AbortError");
        await delay(750, signal);
    }
    throw new DOMException("The request was aborted.", "AbortError");
}

export async function fetchAndPersistMutualGraph(_friends: VrchatUser[], signal: AbortSignal, onProgress?: (processed: number) => void) {
    return runMutualGraphJob(signal, onProgress);
}

export async function refreshMutualGraphFriend(friendId: string, signal: AbortSignal) {
    return runMutualGraphJob(signal, undefined, friendId);
}

export async function cancelMutualGraphFetch() {
    await fetch("/api/mutual-graph", { method: "DELETE" });
}
