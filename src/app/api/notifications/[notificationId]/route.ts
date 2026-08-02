import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";

const notificationIdSchema = z.string().regex(/^not_[a-z0-9_-]+$/i);
const actionSchema = z.union([
    z.object({ action: z.enum(["accept", "hide", "see"]), source: z.literal("legacy") }),
    z.object({ action: z.enum(["hide", "see"]), source: z.literal("v2") }),
    z.object({ action: z.literal("respond"), source: z.literal("v2"), responseType: z.string().min(1).max(64), responseData: z.string().max(4_096).default("") }),
]);

export async function POST(request: NextRequest, context: RouteContext<"/api/notifications/[notificationId]">) {
    const notificationId = notificationIdSchema.safeParse((await context.params).notificationId);
    const body = actionSchema.safeParse(await request.json().catch(() => null));
    if (!notificationId.success || !body.success) {
        return NextResponse.json({ error: "The notification action is invalid." }, { status: 400 });
    }

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });

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

    try {
        const upstream = await requestVrchat<unknown>(endpoint, { method, cookies, body: requestBody });
        const response = NextResponse.json({ success: true });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The notification could not be updated.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401) clearVrchatCookies(response);
        return response;
    }
}
