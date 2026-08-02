import { describe, expect, it } from "vitest";

import { extractVrchatCookies, parseSessionPayload, serializeVrchatCookies } from "./protocol";

describe("VRChat protocol helpers", () => {
    it("keeps only the upstream session cookies", () => {
        const headers = new Headers();
        headers.append("Set-Cookie", "auth=authcookie_example; Path=/; HttpOnly");
        headers.append("Set-Cookie", "twoFactorAuth=twofactor_example; Path=/; HttpOnly");
        headers.append("Set-Cookie", "unrelated=value; Path=/");

        expect(extractVrchatCookies(headers)).toEqual({
            auth: "authcookie_example",
            twoFactorAuth: "twofactor_example",
        });
    });

    it("does not serialize values that could inject cookie attributes", () => {
        expect(
            serializeVrchatCookies({
                auth: "safe",
                twoFactorAuth: "unsafe; injected=true",
            }),
        ).toBe("auth=safe");
    });

    it("maps a two-factor challenge without requiring a user payload", () => {
        expect(parseSessionPayload({ requiresTwoFactorAuth: ["totp", "otp"] })).toEqual({
            status: "two-factor-required",
            methods: ["totp", "otp"],
        });
    });

    it("validates the minimum authenticated user shape", () => {
        expect(parseSessionPayload({ id: "usr_example", displayName: "Example User", status: "active" })).toMatchObject({
            status: "authenticated",
            user: { id: "usr_example", displayName: "Example User" },
        });
    });
});
