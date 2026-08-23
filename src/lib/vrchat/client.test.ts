import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAllowedVrchatEndpoint, requestVrchat } from "./client";

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

    it("allowlists only the fixed Avatar Dialog maintenance paths", () => {
        expect(isAllowedVrchatEndpoint("avatarStyles")).toBe(true);
        expect(isAllowedVrchatEndpoint(`avatars/avtr_${uuid}/selectfallback`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`avatars/avtr_${uuid}/impostor`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`avatars/avtr_${uuid}/impostor/enqueue`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`avatars/avtr_${uuid}/impostor/delete/all`)).toBe(false);
    });

    it("allowlists only the fixed World Dialog publication child", () => {
        expect(isAllowedVrchatEndpoint(`worlds/wrld_${uuid}/publish`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`worlds/wrld_${uuid}/publish/other`)).toBe(false);
    });

    it("allowlists only the active-user/world persistence resources", () => {
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/wrld_${uuid}/persist`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/wrld_${uuid}/persist/exists`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/wrld_${uuid}/persist/export`)).toBe(false);
    });

    it("forwards multipart gallery uploads without overriding the boundary header", async () => {
        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            expect(init?.body).toBeInstanceOf(FormData);
            expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
            return Response.json({ id: `file_${uuid}` });
        });
        vi.stubGlobal("fetch", fetchMock);
        const formData = new FormData();
        formData.set("tag", "gallery");
        formData.set("file", new File(["image"], "gallery.png", { type: "image/png" }));
        await expect(requestVrchat<{ id: string }>("file/image", { method: "POST", formData })).resolves.toMatchObject({ data: { id: `file_${uuid}` } });
    });
});
