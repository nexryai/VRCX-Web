import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { updateNotificationProjection } from "@/lib/notifications/repository";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const notificationIdSchema = z.string().regex(/^not_[a-z0-9_-]+$/i);
const actionSchema = z.union([
    z.object({ action: z.enum(["accept", "hide", "see"]), source: z.literal("legacy") }),
    z.object({ action: z.enum(["hide", "see"]), source: z.literal("v2") }),
    z.object({ action: z.literal("respond"), source: z.literal("v2"), responseType: z.string().min(1).max(64), responseData: z.string().max(4_096).default("") }),
]);
const deleteSchema = z.object({ source: z.enum(["hidden", "legacy", "v2"]) });

export async function POST(request: NextRequest, context: RouteContext<"/api/notifications/[notificationId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const notificationId = notificationIdSchema.safeParse((await context.params).notificationId);
    const body = actionSchema.safeParse(await request.json().catch(() => null));
    if (!notificationId.success || !body.success) {
        return NextResponse.json({ error: "The notification action is invalid." }, { status: 400 });
    }

    let endpoint: string;
    let method: "DELETE" | "POST" | "PUT";
    let requestBody: unknown;
    if (body.data.source === "legacy") {
        endpoint = `auth/user/notifications/${notificationId.data}/${body.data.action}`;
        method = "PUT";
    } else if (body.data.action === "hide") {
        endpoint = `notifications/${notificationId.data}`;
        method = "DELETE";
    } else if (body.data.action === "see") {
        endpoint = `notifications/${notificationId.data}/see`;
        method = "POST";
    } else {
        endpoint = `notifications/${notificationId.data}/respond`;
        method = "POST";
        if (!("responseType" in body.data)) {
            return NextResponse.json({ error: "The notification response is invalid." }, { status: 400 });
        }
        requestBody = {
            notificationId: notificationId.data,
            responseType: body.data.responseType,
            responseData: body.data.responseData,
        };
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(endpoint, { method, cookies, body: requestBody });
        const response = NextResponse.json({ success: true });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        await ensureMongoSchema();
        const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
        if (settings?.activeUserId) {
            await updateNotificationProjection(settings.activeUserId, notificationId.data, body.data.source, body.data.action);
        }
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The notification could not be updated.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/notifications/[notificationId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const notificationId = notificationIdSchema.safeParse((await context.params).notificationId);
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!notificationId.success || !body.success) return NextResponse.json({ error: "The notification deletion request is invalid." }, { status: 400 });
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" });
    if (!settings?.activeUserId) return NextResponse.json({ error: "VRChat authentication is required." }, { status: 401 });
    await collections(await getMongoDatabase()).notifications.deleteOne({ ownerId: settings.activeUserId, notificationId: notificationId.data, source: body.data.source });
    return NextResponse.json({ success: true });
}
