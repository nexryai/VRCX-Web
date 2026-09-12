import { NextResponse } from "next/server";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getVrchatRateLimitSnapshot } from "@/lib/vrchat/rate-limit";

export async function GET() {
    await ensureMongoSchema();
    const state = await collections(await getMongoDatabase()).monitorState.findOne({ _id: "singleton" }, { projection: { leaderId: 0, lastPipelineEventKey: 0 } });
    const rateLimit = getVrchatRateLimitSnapshot();
    const response = NextResponse.json({
        status: state?.status ?? "idle",
        pipelineConnected: state?.pipelineConnected ?? false,
        pipelineCursor: state
            ? {
                  sequence: state.pipelineSequence,
                  type: state.lastPipelineEventType,
              }
            : undefined,
        lastPipelineEventAt: state?.lastPipelineEventAt?.toISOString(),
        lastReconciledAt: state?.lastReconciledAt?.toISOString(),
        monitorStartedAt: state?.monitorStartedAt?.toISOString(),
        vrchatService:
            state?.vrchatServiceIndicator || state?.vrchatServiceLastError
                ? {
                      indicator: state.vrchatServiceIndicator ?? "unknown",
                      description: state.vrchatServiceDescription,
                      affectedComponents: state.vrchatServiceAffectedComponents ?? [],
                      updatedAt: state.vrchatServiceUpdatedAt?.toISOString(),
                      checkedAt: state.vrchatServiceCheckedAt?.toISOString(),
                      error: state.vrchatServiceLastError,
                  }
                : undefined,
        avatarCleanup:
            state?.lastAvatarCleanupAt || state?.lastAvatarCleanupError
                ? {
                      lastRunAt: state.lastAvatarCleanupAt?.toISOString(),
                      deleted: state.lastAvatarCleanupDeleted ?? 0,
                      error: state.lastAvatarCleanupError || undefined,
                  }
                : undefined,
        lastError: state?.lastError || undefined,
        rateLimit: {
            remaining: rateLimit.remaining,
            resetAt: rateLimit.resetAt?.toISOString(),
            blockedUntil: rateLimit.blockedUntil?.toISOString(),
        },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
