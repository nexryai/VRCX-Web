import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { listSelectedFavoriteFriendIds, listSidebarFavoriteFriendGroups } from "@/lib/mongodb/friend-favorites-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { VrchatApiError } from "@/lib/vrchat/client";

const querySchema = z.object({ scope: z.enum(["selected", "sidebar"]).default("selected") });

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The favorite-friends query is invalid." }, { status: 400 });
    try {
        const ownerId = await requireActiveUserId();
        const payload = query.data.scope === "sidebar" ? { groups: await listSidebarFavoriteFriendGroups(ownerId) } : { favoriteIds: await listSelectedFavoriteFriendIds(ownerId) };
        const response = NextResponse.json(payload);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        if (error instanceof VrchatApiError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: "Favorite friends could not be loaded." }, { status: 500 });
    }
}
