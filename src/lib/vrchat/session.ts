import "server-only";

import type { NextResponse } from "next/server";

import { requestVrchat, VrchatApiError } from "./client";
import { parseSessionPayload, type VrchatCookies } from "./protocol";
import type { SessionSnapshot } from "./types";

const AUTH_COOKIE = "vrcx-vrchat-auth";
const TWO_FACTOR_COOKIE = "vrcx-vrchat-two-factor";

type CookieReader = {
    get(name: string): { value: string } | undefined;
};

export function readVrchatCookies(store: CookieReader): VrchatCookies {
    const auth = store.get(AUTH_COOKIE)?.value;
    const twoFactorAuth = store.get(TWO_FACTOR_COOKIE)?.value;
    return {
        ...(auth ? { auth } : {}),
        ...(twoFactorAuth ? { twoFactorAuth } : {}),
    };
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "strict" as const,
        secure: process.env.NODE_ENV === "production" && process.env.VRCHAT_COOKIE_SECURE !== "false",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    };
}

export function applyVrchatCookies(response: NextResponse, cookies: VrchatCookies) {
    if (cookies.auth) {
        response.cookies.set(AUTH_COOKIE, cookies.auth, cookieOptions());
    }
    if (cookies.twoFactorAuth) {
        response.cookies.set(TWO_FACTOR_COOKIE, cookies.twoFactorAuth, cookieOptions());
    }
}

export function clearVrchatCookies(response: NextResponse) {
    response.cookies.set(AUTH_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    response.cookies.set(TWO_FACTOR_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function fetchVrchatSession(cookies: VrchatCookies): Promise<SessionSnapshot> {
    if (!cookies.auth) {
        return { status: "anonymous" };
    }

    try {
        const response = await requestVrchat<unknown>("auth/user", { cookies });
        return parseSessionPayload(response.data);
    } catch (error) {
        if (error instanceof VrchatApiError && error.status === 401) {
            return { status: "anonymous" };
        }
        throw error;
    }
}

export { parseSessionPayload } from "./protocol";
