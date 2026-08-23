import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getRecentActionAt } from "@/lib/mongodb/recent-actions-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { getCachedUser, upsertCachedUser } from "@/lib/mongodb/user-repository";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatUserSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const querySchema = z.object({
    refresh: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

export async function GET(request: NextRequest, context: RouteContext<"/api/users/[userId]">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!userId.success || !query.success) {
        return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    }

    if (!query.data.refresh) {
        const ownerId = await requireActiveUserId();
        await ensureMongoSchema();
        const [cached, snapshot, recentFriendRequestAt] = await Promise.all([getCachedUser(ownerId, userId.data), collections(await getMongoDatabase()).friendSnapshots.findOne({ ownerId, friendId: userId.data }), getRecentActionAt(ownerId, userId.data, "friend-request")]);
        if (cached || snapshot) {
            const response = NextResponse.json({ user: { ...cached, ...snapshot?.user }, recentFriendRequestAt: recentFriendRequestAt?.toISOString() });
            response.headers.set("Cache-Control", "private, no-store");
            return response;
        }
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`users/${userId.data}`, { cookies });
        const user = vrchatUserSchema.parse(upstream.data);
        const ownerId = await requireActiveUserId();
        await upsertCachedUser(ownerId, user, "lookup");
        const recentFriendRequestAt = await getRecentActionAt(ownerId, userId.data, "friend-request");
        const response = NextResponse.json({ user, recentFriendRequestAt: recentFriendRequestAt?.toISOString() });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat user response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}
