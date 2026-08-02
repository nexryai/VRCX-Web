import "server-only";

const MINIMUM_START_INTERVAL_MS = 150;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;

type RateLimitGlobal = typeof globalThis & {
    __vrcxVrchatRateLimit?: {
        tail: Promise<void>;
        nextStartAt: number;
        blockedUntil: number;
        remaining?: number;
        resetAt?: number;
    };
};

const rateLimitGlobal = globalThis as RateLimitGlobal;

function state() {
    rateLimitGlobal.__vrcxVrchatRateLimit ??= {
        tail: Promise.resolve(),
        nextStartAt: 0,
        blockedUntil: 0,
    };
    return rateLimitGlobal.__vrcxVrchatRateLimit;
}

function wait(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function numericHeader(headers: Headers, name: string) {
    const value = Number(headers.get(name));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Coordinates interactive and monitor traffic within a Node.js process. The
 * MongoDB monitor lease already limits background traffic to one process; this
 * gate prevents UI requests from creating a burst alongside reconciliation.
 */
export async function waitForVrchatRequestBudget() {
    const current = state();
    const scheduled = current.tail.then(async () => {
        const delay = Math.max(current.nextStartAt, current.blockedUntil) - Date.now();
        if (delay > 0) await wait(delay);
        current.nextStartAt = Date.now() + MINIMUM_START_INTERVAL_MS;
    });
    current.tail = scheduled.catch(() => undefined);
    await scheduled;
}

export function observeVrchatRateLimit(headers: Headers, status: number) {
    const current = state();
    current.remaining = numericHeader(headers, "x-ratelimit-remaining");

    const resetSeconds = numericHeader(headers, "x-ratelimit-reset");
    if (resetSeconds !== undefined) {
        // VRChat deployments have returned both epoch seconds and durations;
        // accepting either prevents an accidentally unbounded pause.
        current.resetAt = resetSeconds > 10_000_000 ? resetSeconds * 1_000 : Date.now() + resetSeconds * 1_000;
    }

    if (status === 429) {
        const retryAfterSeconds = numericHeader(headers, "retry-after");
        current.blockedUntil = Date.now() + (retryAfterSeconds === undefined ? DEFAULT_RATE_LIMIT_BACKOFF_MS : retryAfterSeconds * 1_000);
    }
}

export function getVrchatRateLimitSnapshot() {
    const current = state();
    return {
        remaining: current.remaining,
        resetAt: current.resetAt ? new Date(current.resetAt) : undefined,
        blockedUntil: current.blockedUntil > Date.now() ? new Date(current.blockedUntil) : undefined,
    };
}
