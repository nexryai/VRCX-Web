import "server-only";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";

const STATUS_URL = "https://status.vrchat.com/api/v2/status.json";
const SUMMARY_URL = "https://status.vrchat.com/api/v2/summary.json";
const OPERATIONAL_INTERVAL_MS = 15 * 60_000;
const ISSUE_INTERVAL_MS = 2 * 60_000;

const indicatorSchema = z.enum(["none", "minor", "major", "critical", "maintenance"]);
const statusResponseSchema = z.object({
    page: z.object({ updated_at: z.iso.datetime() }),
    status: z.object({ indicator: indicatorSchema, description: z.string().min(1).max(200) }),
});
const summaryResponseSchema = z.object({
    components: z.array(z.object({ name: z.string().min(1).max(200), status: z.string().min(1).max(80) })).max(200),
});

export type VrchatServiceStatus = {
    indicator: z.infer<typeof indicatorSchema>;
    description: string;
    affectedComponents: string[];
    updatedAt: Date;
};

export async function fetchVrchatServiceStatus(fetcher: typeof fetch = fetch): Promise<VrchatServiceStatus> {
    const request = async (url: string) => {
        const response = await fetcher(url, { headers: { Referer: "https://vrcx.app" }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`VRChat status request failed with HTTP ${response.status}.`);
        return response.json() as Promise<unknown>;
    };
    const status = statusResponseSchema.parse(await request(STATUS_URL));
    let affectedComponents: string[] = [];
    if (status.status.indicator !== "none") {
        const summary = summaryResponseSchema.parse(await request(SUMMARY_URL));
        affectedComponents = summary.components.filter((component) => component.status !== "operational").map((component) => component.name);
    }
    return {
        indicator: status.status.indicator,
        description: status.status.description,
        affectedComponents,
        updatedAt: new Date(status.page.updated_at),
    };
}

export async function reconcileVrchatServiceStatus(leaderId: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<void> {
    await ensureMongoSchema();
    const monitorState = collections(await getMongoDatabase()).monitorState;
    // Claim the refresh window before network I/O. This coalesces overlapping
    // lease ticks and still leaves a bounded two-minute recovery after a crash.
    const claim = await monitorState.findOneAndUpdate(
        {
            _id: "singleton",
            leaderId,
            leaseExpiresAt: { $gt: now },
            $or: [{ vrchatServiceNextCheckAt: { $lte: now } }, { vrchatServiceNextCheckAt: { $exists: false } }],
        },
        { $set: { vrchatServiceNextCheckAt: new Date(now.getTime() + ISSUE_INTERVAL_MS), updatedAt: now } },
        { returnDocument: "after" },
    );
    if (!claim) return;

    try {
        const status = await fetchVrchatServiceStatus(fetcher);
        const interval = status.indicator === "none" ? OPERATIONAL_INTERVAL_MS : ISSUE_INTERVAL_MS;
        await monitorState.updateOne(
            { _id: "singleton", leaderId, leaseExpiresAt: { $gt: now } },
            {
                $set: {
                    vrchatServiceIndicator: status.indicator,
                    vrchatServiceDescription: status.description,
                    vrchatServiceAffectedComponents: status.affectedComponents,
                    vrchatServiceUpdatedAt: status.updatedAt,
                    vrchatServiceCheckedAt: now,
                    vrchatServiceNextCheckAt: new Date(now.getTime() + interval),
                    updatedAt: now,
                },
                $unset: { vrchatServiceLastError: "" },
            },
        );
    } catch {
        // Preserve the last known service state while making stale/failure
        // status visible. VRCX retries both incidents and failures rapidly.
        await monitorState.updateOne(
            { _id: "singleton", leaderId, leaseExpiresAt: { $gt: now } },
            {
                $set: {
                    vrchatServiceCheckedAt: now,
                    vrchatServiceNextCheckAt: new Date(now.getTime() + ISSUE_INTERVAL_MS),
                    vrchatServiceLastError: "VRChat service status could not be refreshed.",
                    updatedAt: now,
                },
            },
        );
    }
}
