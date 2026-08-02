import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatWorldSchema } from "@/lib/vrchat/types";

const userIdSchema = z.string().regex(/^usr_[0-9a-f-]{36}$/i);
const querySchema = z.object({ offset: z.coerce.number().int().min(0).max(5_000).default(0), sort: z.enum(["created", "popularity", "updated"]).default("updated"), order: z.enum(["ascending", "descending"]).default("descending") });

export async function GET(request: NextRequest, context: RouteContext<"/api/users/[userId]/worlds">) {
    const userId = userIdSchema.safeParse((await context.params).userId);
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!userId.success || !query.success) return NextResponse.json({ error: "The user-worlds query is invalid." }, { status: 400 });
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const ownerId = await requireActiveUserId();
        const ownProfile = ownerId === userId.data;
        const upstream = await requestVrchat<unknown>("worlds", {
            cookies,
            query: { n: 50, offset: query.data.offset, sort: query.data.sort, order: query.data.order, ...(ownProfile ? { user: "me", releaseStatus: "all" } : { userId: userId.data, releaseStatus: "public" }) },
        });
        const worlds = z.array(vrchatWorldSchema).parse(upstream.data);
        await upsertCachedWorlds(ownerId, worlds, "lookup");
        const response = NextResponse.json({ worlds });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat worlds response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return NextResponse.json({ error: message }, { status });
    }
}
