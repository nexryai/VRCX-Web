import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestVrchat } from "./client";

const uuid = "00000000-0000-0000-0000-000000000001";

describe("VRChat response decoding", () => {
    beforeEach(() => {
        delete (globalThis as typeof globalThis & { __vrcxVrchatRateLimit?: unknown }).__vrcxVrchatRateLimit;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns authenticated calendar bytes without JSON decoding", async () => {
        const content = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            expect(new Headers(init?.headers).get("Accept")).toBe("text/calendar");
            return new Response(content, { status: 200, headers: { "Set-Cookie": "auth=rotated; Path=/; HttpOnly" } });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(requestVrchat<string>(`calendar/grp_${uuid}/evt_one.ics`, { cookies: { auth: "current" }, responseType: "text" })).resolves.toEqual({ data: content, cookies: { auth: "rotated" } });
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("keeps JSON decoding as the default", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ ok: true })),
        );
        await expect(requestVrchat<{ ok: boolean }>("config")).resolves.toEqual({ data: { ok: true }, cookies: {} });
    });
});
