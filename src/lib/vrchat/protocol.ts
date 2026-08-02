import { type SessionSnapshot, type TwoFactorMethod, vrchatAuthResponseSchema, vrchatUserSchema } from "./types";

export type VrchatCookies = Partial<Record<"auth" | "twoFactorAuth", string>>;

export function serializeVrchatCookies(cookies: VrchatCookies) {
    return Object.entries(cookies)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !/[;\r\n]/.test(entry[1]))
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}

function getSetCookieValues(headers: Headers) {
    const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof headersWithCookies.getSetCookie === "function") {
        return headersWithCookies.getSetCookie();
    }

    const combined = headers.get("set-cookie");
    return combined ? [combined] : [];
}

export function extractVrchatCookies(headers: Headers): VrchatCookies {
    const result: VrchatCookies = {};

    for (const setCookie of getSetCookieValues(headers)) {
        const [pair] = setCookie.split(";", 1);
        const separator = pair.indexOf("=");
        if (separator < 1) {
            continue;
        }

        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if ((name === "auth" || name === "twoFactorAuth") && value) {
            result[name] = value;
        }
    }

    return result;
}

function supportedTwoFactorMethods(methods: string[]): TwoFactorMethod[] {
    return methods.filter((method): method is TwoFactorMethod => method === "totp" || method === "otp" || method === "emailOtp");
}

export function parseSessionPayload(payload: unknown): SessionSnapshot {
    const authPayload = vrchatAuthResponseSchema.parse(payload);
    if (authPayload.requiresTwoFactorAuth?.length) {
        return {
            status: "two-factor-required",
            methods: supportedTwoFactorMethods(authPayload.requiresTwoFactorAuth),
        };
    }

    return {
        status: "authenticated",
        user: vrchatUserSchema.parse(payload),
    };
}
