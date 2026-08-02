import "server-only";

import type { NextResponse } from "next/server";

import { clearStoredVrchatSession, getStoredVrchatSession, saveAuthenticatedVrchatSession, savePendingVrchatSession, updateStoredVrchatCookies } from "@/lib/mongodb/session-repository";
import { requestVrchat, VrchatApiError } from "./client";
import { parseSessionPayload, type VrchatCookies } from "./protocol";
import type { SessionSnapshot } from "./types";

const LEGACY_AUTH_COOKIE = "vrcx-vrchat-auth";
const LEGACY_TWO_FACTOR_COOKIE = "vrcx-vrchat-two-factor";

function legacyCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "strict" as const,
        secure: process.env.NODE_ENV === "production" && process.env.VRCHAT_COOKIE_SECURE !== "false",
        path: "/",
        maxAge: 0,
    };
}

/** Remove browser-held VRChat cookies created by the superseded prototype. */
export function clearLegacyVrchatCookies(response: NextResponse) {
    response.cookies.set(LEGACY_AUTH_COOKIE, "", legacyCookieOptions());
    response.cookies.set(LEGACY_TWO_FACTOR_COOKIE, "", legacyCookieOptions());
}

export async function getVrchatCookies(): Promise<VrchatCookies | null> {
    const stored = await getStoredVrchatSession();
    return stored?.cookies.auth ? stored.cookies : null;
}

export async function requireVrchatCookies(): Promise<VrchatCookies> {
    const cookies = await getVrchatCookies();
    if (!cookies) throw new VrchatApiError("Sign in to continue.", 401);
    return cookies;
}

export async function persistPendingVrchatSession(cookies: VrchatCookies): Promise<void> {
    await savePendingVrchatSession(cookies);
}

export async function persistAuthenticatedVrchatSession(cookies: VrchatCookies, userId: string): Promise<void> {
    await saveAuthenticatedVrchatSession(cookies, userId);
}

export async function persistRotatedVrchatCookies(cookies: VrchatCookies): Promise<void> {
    if (Object.keys(cookies).length) await updateStoredVrchatCookies(cookies);
}

export async function clearVrchatSession(): Promise<void> {
    await clearStoredVrchatSession();
}

export async function fetchVrchatSession(): Promise<SessionSnapshot> {
    const stored = await getStoredVrchatSession();
    if (!stored?.cookies.auth) return { status: "anonymous" };
    if (stored.status === "pending-two-factor") {
        // VRChat only reveals the exact accepted methods on the initial auth
        // response. Present all supported choices after a server restart.
        return { status: "two-factor-required", methods: ["totp", "otp", "emailOtp"] };
    }

    try {
        const response = await requestVrchat<unknown>("auth/user", { cookies: stored.cookies });
        const snapshot = parseSessionPayload(response.data);
        await persistRotatedVrchatCookies(response.cookies);
        if (snapshot.status === "authenticated") {
            await persistAuthenticatedVrchatSession({ ...stored.cookies, ...response.cookies }, snapshot.user.id);
        }
        return snapshot;
    } catch (error) {
        if (error instanceof VrchatApiError && error.status === 401) {
            await clearVrchatSession();
            return { status: "anonymous" };
        }
        throw error;
    }
}

export { parseSessionPayload } from "./protocol";
