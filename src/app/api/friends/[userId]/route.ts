import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { recordRecentAction } from "@/lib/mongodb/recent-actions-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { patchCachedUser } from "@/lib/mongodb/user-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const userIdSchema = z.string().regex(/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function POST(request: NextRequest, context: RouteContext<"/api/friends/[userId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const ownerId = await requireActiveUserId();
        const upstream = await requestVrchat<unknown>(`user/${userId.data}/friendRequest`, { method: "POST", cookies });
        const payload = z.object({ success: z.boolean().optional() }).passthrough().parse(upstream.data);
        let reconciliationRequired = false;
        let recentFriendRequestAt: Date | null = null;
        try {
            await patchCachedUser(ownerId, userId.data, payload.success ? { isFriend: true, friendRequestStatus: "" } : { friendRequestStatus: "outgoing" });
        } catch {
            // The upstream request is non-idempotent. Report its success and
            // repair MongoDB through normal reconciliation instead of asking
            // the browser to repeat a friend request VRChat already accepted.
            reconciliationRequired = true;
        }
        if (payload.success !== true) {
            recentFriendRequestAt = new Date();
            try {
                await recordRecentAction(ownerId, userId.data, "friend-request", recentFriendRequestAt);
            } catch {
                // The current browser can still show the upstream-successful
                // action. A database outage may prevent restart recovery, but
                // must never invite a duplicate friend request.
                reconciliationRequired = true;
            }
        }
        try {
            await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        } catch {
            reconciliationRequired = true;
        }
        const response = NextResponse.json({ success: payload.success === true, outgoing: payload.success !== true, recentFriendRequestAt: recentFriendRequestAt?.toISOString(), reconciliationRequired });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The friend request could not be sent.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/friends/[userId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) {
        return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`auth/user/friends/${userId.data}`, {
            method: "DELETE",
            cookies,
        });
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The friend could not be removed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}
