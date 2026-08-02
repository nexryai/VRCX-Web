import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { cancelMutualGraphJob, startMutualGraphJob } from "@/lib/mutual-graph-job";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requireVrchatCookies } from "@/lib/vrchat/session";

export async function GET() {
    const ownerId = await requireActiveUserId();
    await ensureMongoSchema();
    const graph = await collections(await getMongoDatabase()).mutualGraph.findOne({ ownerId });
    const response = NextResponse.json({
        snapshot: graph
            ? {
                  relationships: graph.relationships,
                  optedOut: graph.optedOut,
                  updatedAt: graph.updatedAt.toISOString(),
              }
            : null,
        job: graph
            ? {
                  status: graph.jobStatus || "complete",
                  processed: graph.jobProcessed || 0,
                  total: graph.jobTotal || 0,
                  error: graph.jobError,
              }
            : { status: "complete", processed: 0, total: 0 },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = z
        .object({
            friendId: z
                .string()
                .regex(/^usr_[0-9a-f-]{36}$/i)
                .optional(),
        })
        .safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "The mutual graph request is invalid." }, { status: 400 });
    const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
    const started = await startMutualGraphJob(ownerId, cookies, body.data.friendId);
    return NextResponse.json({ started }, { status: started ? 202 : 409 });
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    return NextResponse.json({ cancelled: await cancelMutualGraphJob(await requireActiveUserId()) });
}
