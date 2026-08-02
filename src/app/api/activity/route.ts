import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(2_000).default(2_000) });
const deleteSchema = z.object({ id: z.string().length(64).optional(), all: z.boolean().optional() }).refine((value) => Boolean(value.id) !== Boolean(value.all));

async function activeOwnerId() {
    const stored = await getStoredVrchatSession();
    return stored?.status === "authenticated" ? stored.activeUserId : undefined;
}

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The activity query is invalid." }, { status: 400 });
    const ownerId = await activeOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Sign in to view activity." }, { status: 401 });
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .activityEvents.find({ ownerId })
        .sort({ occurredAt: -1 })
        .limit(query.data.limit)
        .toArray();
    const entries = documents.map((entry) => ({
        id: entry._id,
        type: entry.type,
        userId: entry.subjectUserId,
        displayName: entry.displayName,
        createdAt: entry.occurredAt.toISOString(),
        previous: entry.previous,
        current: entry.current,
    }));
    const response = NextResponse.json({ entries });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The activity deletion request is invalid." }, { status: 400 });
    const ownerId = await activeOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Sign in to update activity." }, { status: 401 });
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    if (body.data.all) await c.activityEvents.deleteMany({ ownerId });
    else await c.activityEvents.deleteOne({ _id: body.data.id, ownerId });
    return NextResponse.json({ success: true });
}
