import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { patchCachedUser } from "@/lib/mongodb/user-repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const userIdSchema = z.string().regex(/^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const bodySchema = z
    .object({
        note: z
            .string()
            .max(256)
            .transform((value) => value.replace(/[\r\n]/g, "").trim()),
    })
    .strict();
const responseSchema = z.object({ note: z.string().optional() }).passthrough();

export async function PUT(request: NextRequest, context: RouteContext<"/api/users/[userId]/note">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const userId = userIdSchema.safeParse((await context.params).userId);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!userId.success || !body.success) return NextResponse.json({ error: "The note update is invalid." }, { status: 400 });
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>("userNotes", { method: "POST", cookies, body: { targetUserId: userId.data, note: body.data.note } });
        const parsed = responseSchema.parse(upstream.data);
        const note = parsed.note ?? body.data.note;
        await patchCachedUser(await requireActiveUserId(), userId.data, { note });
        const response = NextResponse.json({ note });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The user note could not be saved." }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}
