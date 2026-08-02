import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";

const querySchema = z.object({
    n: z.coerce.number().int().min(1).max(100).default(100),
    offset: z.coerce.number().int().min(0).max(7500).default(0),
    offline: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The friend-list query is invalid." }, { status: 400 });
    const stored = await getStoredVrchatSession();
    if (!stored?.activeUserId || stored.status !== "authenticated") return NextResponse.json({ error: "Sign in to view friends." }, { status: 401 });

    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .friendSnapshots.find({ ownerId: stored.activeUserId, online: !query.data.offline })
        .sort({ "user.displayName": 1, friendId: 1 })
        .skip(query.data.offset)
        .limit(query.data.n)
        .toArray();
    const response = NextResponse.json({ friends: documents.map((document) => document.user) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
