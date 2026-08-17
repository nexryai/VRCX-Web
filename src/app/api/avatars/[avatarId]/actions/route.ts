import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { deactivateAvatarModeration, upsertAvatarModeration } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { avatarActionSchema, avatarActionTargetError } from "@/lib/vrchat/avatar-actions";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarModerationSchema, vrchatAvatarSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
async function fetchActionAvatar(ownerId: string, avatarId: string, cookies: VrchatCookies) {
    const upstream = await requestVrchat<unknown>(`avatars/${avatarId}`, { cookies });
    const avatar = vrchatAvatarSchema.parse(upstream.data);
    if (avatar.id !== avatarId) throw new Error("The avatar response did not match the requested avatar.");
    await upsertCachedAvatars(ownerId, [avatar], "lookup");
    return { avatar, cookies: { ...cookies, ...upstream.cookies } };
}

export async function POST(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/actions">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    const body = avatarActionSchema.safeParse(await request.json().catch(() => null));
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
        if (body.data.action === "select") {
            const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}/select`, { method: "PUT", cookies });
            const session = await Promise.allSettled([persistRotatedVrchatCookies(upstream.cookies, cookies.auth)]);
            return actionResponse({ success: true, refreshRequired: session[0].status === "rejected" });
        }

        const avatarState = await fetchActionAvatar(ownerId, avatarId.data, cookies);
        const targetError = avatarActionTargetError(body.data.action, avatarState.avatar, ownerId);
        if (targetError) {
            await Promise.allSettled([persistRotatedVrchatCookies(avatarState.cookies, cookies.auth)]);
            return actionResponse({ error: targetError }, body.data.action === "select-fallback" ? 400 : 403);
        }
        if (body.data.action === "select-fallback") {
            const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}/selectfallback`, { method: "PUT", cookies: avatarState.cookies });
            const session = await Promise.allSettled([persistRotatedVrchatCookies({ ...avatarState.cookies, ...upstream.cookies }, cookies.auth)]);
            return actionResponse({ success: true, fallbackSelected: true, refreshRequired: session[0].status === "rejected" });
        }
        let currentCookies = avatarState.cookies;
        if (body.data.action === "delete-impostor" || body.data.action === "regenerate-impostor") {
            try {
                const deleted = await requestVrchat<unknown>(`avatars/${avatarId.data}/impostor`, { method: "DELETE", cookies: currentCookies });
                currentCookies = { ...currentCookies, ...deleted.cookies };
            } catch (error) {
                // VRCX still enqueues regeneration from finally when deletion
                // fails. Preserve that behavior only for the combined command.
                if (body.data.action !== "regenerate-impostor") throw error;
            }
            if (body.data.action === "delete-impostor") {
                const session = await Promise.allSettled([persistRotatedVrchatCookies(currentCookies, cookies.auth)]);
                return actionResponse({ success: true, hasImpostor: false, refreshRequired: session[0].status === "rejected" });
            }
        }
        const upstream = await requestVrchat<unknown>(`avatars/${avatarId.data}/impostor/enqueue`, { method: "POST", cookies: currentCookies });
        const session = await Promise.allSettled([persistRotatedVrchatCookies({ ...currentCookies, ...upstream.cookies }, cookies.auth)]);
        return actionResponse({ success: true, hasImpostor: false, queued: true, refreshRequired: session[0].status === "rejected" });
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The avatar action could not be completed.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

function actionResponse(payload: object, status = 200) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
