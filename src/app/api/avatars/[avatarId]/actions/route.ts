import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { deactivateAvatarModeration, upsertAvatarModeration } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarModerationSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const actionSchema = z.object({ action: z.enum(["block", "enqueue-impostor", "select", "unblock"]) }).strict();

export async function POST(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/actions">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = actionSchema.safeParse(await request.json().catch(() => null));
    if (!avatarId.success || !body.success) return NextResponse.json({ error: "The avatar action is invalid." }, { status: 400 });

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        if (body.data.action === "block") {
            const upstream = await requestVrchat<unknown>("auth/user/avatarmoderations", {
                method: "POST",
                cookies,
                body: { avatarModerationType: "block", targetAvatarId: avatarId.data },
            });
            const moderation = vrchatAvatarModerationSchema.safeParse(upstream.data);
            const persistence = await Promise.allSettled([...(moderation.success ? [upsertAvatarModeration(ownerId, moderation.data)] : []), persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
            return actionResponse({ success: true, isBlocked: true, refreshRequired: !moderation.success || persistence.some((result) => result.status === "rejected") });
        }
        if (body.data.action === "unblock") {
            const upstream = await requestVrchat<unknown>("auth/user/avatarmoderations", {
                method: "DELETE",
                cookies,
                query: { avatarModerationType: "block", targetAvatarId: avatarId.data },
            });
            const [projection, session] = await Promise.allSettled([deactivateAvatarModeration(ownerId, avatarId.data), persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
            return actionResponse({ success: true, isBlocked: false, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
        }
        const endpoint = body.data.action === "select" ? `avatars/${avatarId.data}/select` : `avatars/${avatarId.data}/impostor/enqueue`;
        const upstream = await requestVrchat<unknown>(endpoint, { method: body.data.action === "select" ? "PUT" : "POST", cookies });
        const session = await Promise.allSettled([persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
        return actionResponse({ success: true, refreshRequired: session[0].status === "rejected" });
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The avatar action could not be completed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

function actionResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
