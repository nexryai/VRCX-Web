import { NextResponse } from "next/server";

import { z } from "zod";

import { hotWorldFriendsResponseSchema, hotWorldPeriodSchema, hotWorldsResponseSchema } from "@/lib/hot-worlds";
import { listHotWorldFriends, listHotWorlds } from "@/lib/mongodb/hot-worlds-repository";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { worldIdSchema } from "@/lib/vrchat/ids";

const querySchema = z.object({ days: z.coerce.number().pipe(hotWorldPeriodSchema).default(30), worldId: worldIdSchema.optional() });

function json(body: unknown, init?: ResponseInit) {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function GET(request: Request) {
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return json({ error: "The Hot Worlds query is invalid." }, { status: 400 });
    const stored = await getStoredVrchatSession();
    if (!stored?.activeUserId || stored.status !== "authenticated") return json({ error: "Sign in to view Hot Worlds." }, { status: 401 });

    if (query.data.worldId) {
        const friends = await listHotWorldFriends(stored.activeUserId, query.data.worldId, query.data.days);
        return json(hotWorldFriendsResponseSchema.parse({ days: query.data.days, worldId: query.data.worldId, friends }));
    }
    const worlds = await listHotWorlds(stored.activeUserId, query.data.days);
    return json(hotWorldsResponseSchema.parse({ days: query.data.days, worlds }));
}
