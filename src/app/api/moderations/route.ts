import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { deactivateModeration } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { userIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const deleteSchema = z.object({
    moderated: userIdSchema,
    type: z.string().trim().min(1).max(64),
});

export async function GET(_request: NextRequest) {
    try {
        const ownerId = await requireActiveUserId();
        await ensureMongoSchema();
        const documents = await collections(await getMongoDatabase())
            .moderations.find({ ownerId, active: true })
            .sort({ updatedAt: -1 })
            .toArray();
        const moderations = documents.map((document) => document.moderation);
        const response = NextResponse.json({ moderations });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await moderationError(error, "The VRChat moderation response was not valid.");
    }
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ error: "The moderation request is invalid." }, { status: 400 });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>("auth/user/unplayermoderate", {
            method: "PUT",
            cookies,
            body: body.data,
        });
        await deactivateModeration(await requireActiveUserId(), body.data.moderated, body.data.type);
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return await moderationError(error, "The moderation could not be removed.", expectedAuthCookie);
    }
}

async function moderationError(error: unknown, fallback: string, expectedAuthCookie?: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response;
}
