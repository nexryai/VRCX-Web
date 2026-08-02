import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { patchCachedUser } from "@/lib/mongodb/user-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);

export async function DELETE(request: NextRequest, context: RouteContext<"/api/friends/[userId]/request">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const userId = userIdSchema.safeParse((await context.params).userId);
    if (!userId.success) return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`user/${userId.data}/friendRequest`, { method: "DELETE", cookies });
        await patchCachedUser(await requireActiveUserId(), userId.data, { friendRequestStatus: "" });
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The friend request could not be cancelled." }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}
