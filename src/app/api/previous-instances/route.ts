import { NextResponse } from "next/server";

import { z } from "zod";

import { listPreviousInstances } from "@/lib/mongodb/previous-instances-repository";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { previousInstancesResponseSchema } from "@/lib/previous-instances";
import { groupIdSchema, userIdSchema, worldIdSchema } from "@/lib/vrchat/ids";

const querySchema = z.discriminatedUnion("variant", [z.object({ variant: z.literal("user"), id: userIdSchema }), z.object({ variant: z.literal("world"), id: worldIdSchema }), z.object({ variant: z.literal("group"), id: groupIdSchema })]);

function json(body: unknown, init?: ResponseInit) {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function GET(request: Request) {
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return json({ error: "The previous-instances query is invalid." }, { status: 400 });

    const stored = await getStoredVrchatSession();
    if (!stored?.activeUserId || stored.status !== "authenticated") return json({ error: "Sign in to view previous instances." }, { status: 401 });

    const rows = await listPreviousInstances(stored.activeUserId, query.data.variant, query.data.id);
    return json(previousInstancesResponseSchema.parse({ rows }));
}
