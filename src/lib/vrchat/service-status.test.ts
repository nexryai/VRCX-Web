import { describe, expect, it, vi } from "vitest";

import { fetchVrchatServiceStatus } from "./service-status";

describe("VRChat public service status", () => {
    it("uses only the status endpoint while all systems are operational", async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ page: { updated_at: "2026-09-13T12:00:00.000Z" }, status: { indicator: "none", description: "All Systems Operational" } }), { status: 200 }));

        await expect(fetchVrchatServiceStatus(fetcher)).resolves.toEqual({
            indicator: "none",
            description: "All Systems Operational",
            affectedComponents: [],
            updatedAt: new Date("2026-09-13T12:00:00.000Z"),
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith("https://status.vrchat.com/api/v2/status.json", expect.objectContaining({ headers: { Referer: "https://vrcx.app" } }));
    });

    it("summarizes only non-operational components during an incident", async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify({ page: { updated_at: "2026-09-13T12:00:00.000Z" }, status: { indicator: "major", description: "Major Service Outage" } }), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        components: [
                            { name: "API", status: "major_outage" },
                            { name: "Website", status: "operational" },
                            { name: "Realtime Pipeline", status: "degraded_performance" },
                        ],
                    }),
                    { status: 200 },
                ),
            );

        await expect(fetchVrchatServiceStatus(fetcher)).resolves.toMatchObject({ indicator: "major", affectedComponents: ["API", "Realtime Pipeline"] });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("rejects malformed and unsuccessful upstream responses", async () => {
        await expect(fetchVrchatServiceStatus(vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 })))).rejects.toThrow("HTTP 503");
        await expect(fetchVrchatServiceStatus(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: { indicator: "none" } }), { status: 200 })))).rejects.toThrow();
    });
});
