import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { isMutationOriginAllowed } from "@/lib/request-security";
import { createBasicAuthorization, requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearLegacyVrchatCookies, parseSessionPayload, persistAuthenticatedVrchatSession, persistPendingVrchatSession } from "@/lib/vrchat/session";

const loginSchema = z.object({
    username: z.string().trim().min(1).max(256),
    password: z.string().min(1).max(1024),
});

function errorResponse(error: unknown) {
    if (error instanceof VrchatApiError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The VRChat login response was not valid." }, { status: 502 });
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
    }

    try {
        // VRCX checks config before login so upstream access failures surface
        // separately from invalid credentials.
        await requestVrchat<unknown>("config");
        const upstream = await requestVrchat<unknown>("auth/user", {
            authorization: createBasicAuthorization(parsed.data.username, parsed.data.password),
        });
        const snapshot = parseSessionPayload(upstream.data);
        if (snapshot.status === "authenticated") {
            await persistAuthenticatedVrchatSession(upstream.cookies, snapshot.user.id);
        } else {
            await persistPendingVrchatSession(upstream.cookies);
        }
        const response = NextResponse.json(snapshot);
        clearLegacyVrchatCookies(response);
        response.headers.set("Cache-Control", "no-store");
        return response;
    } catch (error) {
        return errorResponse(error);
    }
}
