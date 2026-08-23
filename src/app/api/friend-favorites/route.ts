import { NextResponse } from "next/server";

import { listSelectedFavoriteFriendIds } from "@/lib/mongodb/friend-favorites-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { VrchatApiError } from "@/lib/vrchat/client";

export async function GET() {
    try {
        const favoriteIds = await listSelectedFavoriteFriendIds(await requireActiveUserId());
        const response = NextResponse.json({ favoriteIds });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        if (error instanceof VrchatApiError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: "Favorite friends could not be loaded." }, { status: 500 });
    }
}
