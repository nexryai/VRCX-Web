import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedPublicProfile, replaceCachedPublicProfile } from "@/lib/mongodb/public-profile-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatPublicProfileSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const querySchema = z.object({
    refresh: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
});

export async function GET(request: NextRequest, context: RouteContext<"/api/users/[userId]/profile">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!userId.success || !query.success) return NextResponse.json({ error: "The VRChat user ID is invalid." }, { status: 400 });

    const ownerId = await requireActiveUserId();
    const cached = await getCachedPublicProfile(ownerId, userId.data);
    if (!query.data.refresh && cached) return noStore({ profile: cached.profile, observedAt: cached.observedAt.toISOString() });

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(`profile/${userId.data}`, { cookies });
        const profile = vrchatPublicProfileSchema.parse(upstream.data);
        if (profile.id !== userId.data) throw new Error("The public profile did not match the requested user.");
        const observedAt = new Date();
        await replaceCachedPublicProfile(ownerId, userId.data, profile, observedAt);
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        return noStore({ profile, observedAt: observedAt.toISOString() });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) {
            await clearVrchatSession(expectedAuthCookie);
        } else if (cached) {
            return noStore({ profile: cached.profile, observedAt: cached.observedAt.toISOString(), stale: true });
        }
        return NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The VRChat public profile response was not valid." }, { status });
    }
}

function noStore(body: object) {
    const response = NextResponse.json(body);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
