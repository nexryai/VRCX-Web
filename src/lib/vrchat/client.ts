import "server-only";

import { z } from "zod";

import { extractVrchatCookies, serializeVrchatCookies, type VrchatCookies } from "./protocol";
import { observeVrchatRateLimit, waitForVrchatRequestBudget } from "./rate-limit";

const VRCHAT_API_BASE = "https://api.vrchat.cloud/api/1/";
const REQUEST_TIMEOUT_MS = 15_000;

const allowedEndpoints = [
    "auth",
    "avatars/favorites",
    "auth/user/favoritelimits",
    "auth/user",
    "auth/user/friends",
    "auth/user/notifications",
    "auth/user/playermoderations",
    "auth/user/unplayermoderate",
    "config",
    "favorite/groups",
    "favorites",
    "groups",
    "notifications",
    "userNotes",
    "users",
    "worlds",
    "worlds/active",
    "worlds/favorites",
    "worlds/recent",
    "auth/twofactorauth/otp/verify",
    "auth/twofactorauth/totp/verify",
    "auth/twofactorauth/emailotp/verify",
];
const allowedEndpointSet = new Set(allowedEndpoints);
const allowedEndpointPatterns = [
    /^avatars\/avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^avatars\/avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/select$/i,
    /^avatars\/avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/impostor\/enqueue$/i,
    /^users\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^user\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/friendRequest$/i,
    /^users\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/groups$/i,
    /^users\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/instances\/groups$/i,
    /^users\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/instances\/groups\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^worlds\/wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^groups\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^groups\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(posts|members)$/i,
    /^groups\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(block|join|leave|representation|requests)$/i,
    /^groups\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/members\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^calendar\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^calendar\/grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9_-]+(?:\/follow)?$/i,
    /^users\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/mutuals\/friends$/i,
    /^auth\/user\/friends\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^auth\/user\/notifications\/not_[a-z0-9_-]+\/(accept|hide|see)$/i,
    /^favorites\/(usr|wrld|avtr)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^favorite\/group\/(avatar|friend|world|vrcPlusWorld)\/[a-z0-9_-]+\/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    /^notifications\/not_[a-z0-9_-]+$/i,
    /^notifications\/not_[a-z0-9_-]+\/(respond|see)$/i,
];

const errorPayloadSchema = z
    .object({
        error: z
            .object({
                message: z.string().optional(),
                status_code: z.number().optional(),
            })
            .optional(),
    })
    .passthrough();

type VrchatRequestOptions = {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    authorization?: string;
    cookies?: VrchatCookies;
    query?: Record<string, boolean | number | string | undefined>;
    body?: unknown;
};

type VrchatResponse<T> = {
    data: T;
    cookies: VrchatCookies;
};

export class VrchatApiError extends Error {
    readonly status: number;
    readonly upstreamCode?: number;

    constructor(message: string, status: number, upstreamCode?: number) {
        super(message);
        this.name = "VrchatApiError";
        this.status = status;
        this.upstreamCode = upstreamCode;
    }
}

export function isAllowedVrchatEndpoint(endpoint: string): boolean {
    return allowedEndpointSet.has(endpoint) || allowedEndpointPatterns.some((pattern) => pattern.test(endpoint));
}

function assertAllowedEndpoint(endpoint: string) {
    if (!isAllowedVrchatEndpoint(endpoint)) {
        throw new Error(`VRChat endpoint is not allowlisted: ${endpoint}`);
    }
}

function parseJson(text: string): unknown {
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new VrchatApiError("VRChat returned an invalid response.", 502);
    }
}

function upstreamError(payload: unknown, status: number) {
    const parsed = errorPayloadSchema.safeParse(payload);
    const upstreamMessage = parsed.success ? parsed.data.error?.message?.replace(/^"|"$/g, "") : undefined;

    if (status === 401) {
        return new VrchatApiError(upstreamMessage || "VRChat rejected the credentials or session.", 401, parsed.success ? parsed.data.error?.status_code : undefined);
    }
    if (status === 403) {
        return new VrchatApiError(upstreamMessage || "VRChat refused this request.", 403, parsed.success ? parsed.data.error?.status_code : undefined);
    }
    if (status === 429) {
        return new VrchatApiError("VRChat rate limited this request. Please wait and try again.", 429, parsed.success ? parsed.data.error?.status_code : undefined);
    }

    return new VrchatApiError(upstreamMessage || "VRChat could not complete this request.", status >= 500 ? 502 : status, parsed.success ? parsed.data.error?.status_code : undefined);
}

/**
 * Executes an allowlisted request against the official VRChat API. This is the
 * server-side replacement for VRCX's native WebApi bridge; credentials and
 * upstream cookies must never cross into client-readable state.
 */
export async function requestVrchat<T>(endpoint: string, options: VrchatRequestOptions = {}): Promise<VrchatResponse<T>> {
    assertAllowedEndpoint(endpoint);

    const url = new URL(endpoint, VRCHAT_API_BASE);
    for (const [name, value] of Object.entries(options.query || {})) {
        if (value !== undefined) {
            url.searchParams.set(name, String(value));
        }
    }

    const headers = new Headers({
        Accept: "application/json",
        "User-Agent": process.env.VRCHAT_USER_AGENT?.trim() || "VRCX-Web/0.1.0",
    });
    if (options.authorization) {
        headers.set("Authorization", options.authorization);
    }
    if (options.cookies) {
        const cookieHeader = serializeVrchatCookies(options.cookies);
        if (cookieHeader) {
            headers.set("Cookie", cookieHeader);
        }
    }
    if (options.body !== undefined) {
        headers.set("Content-Type", "application/json;charset=utf-8");
    }

    let response: Response;
    try {
        await waitForVrchatRequestBudget();
        response = await fetch(url, {
            method: options.method || "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
            throw new VrchatApiError("VRChat did not respond in time.", 504);
        }
        throw new VrchatApiError("VRChat is currently unreachable.", 502);
    }

    observeVrchatRateLimit(response.headers, response.status);

    const data = parseJson(await response.text());
    if (!response.ok) {
        throw upstreamError(data, response.status);
    }

    return {
        data: data as T,
        cookies: extractVrchatCookies(response.headers),
    };
}

export function createBasicAuthorization(username: string, password: string) {
    // VRCX URI-encodes both fields before applying HTTP Basic authentication.
    const encodedCredentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
    return `Basic ${Buffer.from(encodedCredentials, "utf8").toString("base64")}`;
}

export type { VrchatCookies } from "./protocol";
