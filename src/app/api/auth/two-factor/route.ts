import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, parseSessionPayload, readVrchatCookies } from "@/lib/vrchat/session";
import type { TwoFactorMethod } from "@/lib/vrchat/types";

const verificationSchema = z.object({
    method: z.enum(["totp", "otp", "emailOtp"]),
    code: z.string().trim().min(1).max(32),
});

const verificationEndpoints: Record<TwoFactorMethod, string> = {
    totp: "auth/twofactorauth/totp/verify",
    otp: "auth/twofactorauth/otp/verify",
    emailOtp: "auth/twofactorauth/emailotp/verify",
};

function normalizeCode(method: TwoFactorMethod, code: string) {
    const compact = code.replace(/[\s-]/g, "");
    if (method === "otp" && compact.length === 8) {
        return `${compact.slice(0, 4)}-${compact.slice(4)}`;
    }
    return compact;
}

export async function POST(request: NextRequest) {
    const parsed = verificationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Enter a valid verification code." }, { status: 400 });
    }

    const existingCookies = readVrchatCookies(request.cookies);
    if (!existingCookies.auth) {
        return NextResponse.json({ error: "The login session expired. Sign in again." }, { status: 401 });
    }

    try {
        const verification = await requestVrchat<unknown>(verificationEndpoints[parsed.data.method], {
            method: "POST",
            cookies: existingCookies,
            body: { code: normalizeCode(parsed.data.method, parsed.data.code) },
        });
        const combinedCookies = { ...existingCookies, ...verification.cookies };
        const currentUser = await requestVrchat<unknown>("auth/user", { cookies: combinedCookies });
        const response = NextResponse.json(parseSessionPayload(currentUser.data));
        applyVrchatCookies(response, { ...combinedCookies, ...currentUser.cookies });
        response.headers.set("Cache-Control", "no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The verification response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        return NextResponse.json({ error: message }, { status });
    }
}
