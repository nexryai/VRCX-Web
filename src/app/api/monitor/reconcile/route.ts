import { type NextRequest, NextResponse } from "next/server";

import { clearStoredVrchatSession, getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { reconcileRemoteState } from "@/lib/monitor/reconcile";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { VrchatApiError } from "@/lib/vrchat/client";

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const stored = await getStoredVrchatSession();
    if (!stored?.cookies.auth || stored.status !== "authenticated") return NextResponse.json({ error: "Sign in to refresh remote state." }, { status: 401 });
    try {
        const result = await reconcileRemoteState(stored.cookies, undefined, stored.activeUserId);
        if (!result) return NextResponse.json({ success: true, accepted: true, message: "A reconciliation is already running." }, { status: 202 });
        return NextResponse.json({ success: true, observedAt: new Date().toISOString(), userId: result.user.id });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const message = error instanceof VrchatApiError ? error.message : "Remote state could not be reconciled.";
        if (status === 401) await clearStoredVrchatSession({ activeUserId: stored.activeUserId, authCookie: stored.cookies.auth });
        return NextResponse.json({ error: message }, { status });
    }
}
