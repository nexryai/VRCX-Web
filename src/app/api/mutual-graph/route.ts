import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);
const graphSchema = z.object({
    relationships: z.record(userIdSchema, z.array(userIdSchema).max(10_000)),
    optedOut: z.array(userIdSchema).max(10_000),
    updatedAt: z.iso.datetime(),
});

async function activeOwnerId() {
    const stored = await getStoredVrchatSession();
    return stored?.status === "authenticated" ? stored.activeUserId : undefined;
}

export async function GET() {
    const ownerId = await activeOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Sign in to view the mutual graph." }, { status: 401 });
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
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function PUT(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const ownerId = await activeOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Sign in to save the mutual graph." }, { status: 401 });
    const body = graphSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The mutual graph snapshot is invalid." }, { status: 400 });
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).mutualGraph.updateOne(
        { _id: ownerId },
        {
            $set: {
                ownerId,
                relationships: body.data.relationships,
                optedOut: body.data.optedOut,
                updatedAt: new Date(body.data.updatedAt),
            },
        },
        { upsert: true },
    );
    return NextResponse.json({ success: true });
}
