import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
import { vrchatNotificationSchema } from "@/lib/vrchat/types";

const querySchema = z.object({
    source: z.enum(["legacy", "v2", "hidden"]),
    offset: z.coerce.number().int().min(0).max(5_000).default(0),
});

export async function GET(request: NextRequest) {
    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });

    const query = querySchema.safeParse({
        source: request.nextUrl.searchParams.get("source"),
        offset: request.nextUrl.searchParams.get("offset") || 0,
    });
    if (!query.success) return NextResponse.json({ error: "The notification query is invalid." }, { status: 400 });

    const { source, offset } = query.data;
    try {
        const upstream = await requestVrchat<unknown>(source === "v2" ? "notifications" : "auth/user/notifications", {
            cookies,
            query: {
                n: 100,
                offset,
                ...(source === "hidden" ? { type: "friendRequest", hidden: true } : {}),
            },
        });
        const parsed = z.array(vrchatNotificationSchema).parse(upstream.data);
        const notifications = parsed.map((notification) => ({
            ...notification,
            type: source === "hidden" ? "ignoredFriendRequest" : notification.type,
            source,
        }));
        const response = NextResponse.json({ notifications });
        applyVrchatCookies(response, upstream.cookies);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        return notificationError(error, "The VRChat notification response was not valid.");
    }
}

function notificationError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) clearVrchatCookies(response);
    return response;
}
