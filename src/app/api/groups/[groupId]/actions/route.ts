import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { setCachedGroupMembershipActive, upsertCachedGroups } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupSchema } from "@/lib/vrchat/types";

const groupIdSchema = z.string().regex(/^grp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const actionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.enum(["block", "cancel-request", "join", "leave", "unblock"]) }).strict(),
    z.object({ action: z.literal("representation"), value: z.boolean() }).strict(),
    z.object({ action: z.literal("visibility"), value: z.enum(["friends", "hidden", "visible"]) }).strict(),
    z.object({ action: z.enum(["announcements", "event-announcements"]), value: z.boolean() }).strict(),
]);

type GroupAction = z.infer<typeof actionSchema>;

function mutationFor(action: GroupAction, groupId: string, ownerId: string) {
    switch (action.action) {
        case "join":
            return { endpoint: `groups/${groupId}/join`, method: "POST" as const };
        case "cancel-request":
            return { endpoint: `groups/${groupId}/requests`, method: "DELETE" as const };
        case "leave":
            return { endpoint: `groups/${groupId}/leave`, method: "POST" as const };
        case "block":
            return { endpoint: `groups/${groupId}/block`, method: "POST" as const };
        case "unblock":
            return { endpoint: `groups/${groupId}/members/${ownerId}`, method: "DELETE" as const };
        case "representation":
            return { endpoint: `groups/${groupId}/representation`, method: "PUT" as const, body: { isRepresenting: action.value } };
        case "visibility":
            return { endpoint: `groups/${groupId}/members/${ownerId}`, method: "PUT" as const, body: { visibility: action.value } };
        case "announcements":
            return { endpoint: `groups/${groupId}/members/${ownerId}`, method: "PUT" as const, body: { isSubscribedToAnnouncements: action.value } };
        case "event-announcements":
            return { endpoint: `groups/${groupId}/members/${ownerId}`, method: "PUT" as const, body: { isSubscribedToEventAnnouncements: action.value } };
    }
}

async function refreshGroup(ownerId: string, groupId: string, cookies: VrchatCookies) {
    const upstream = await requestVrchat<unknown>(`groups/${groupId}`, { cookies, query: { includeRoles: true } });
    const group = vrchatGroupSchema.parse(upstream.data);
    const membershipActive = group.membershipStatus === "member" || group.myMember?.membershipStatus === "member";
    const observedAt = new Date();
    await upsertCachedGroups(ownerId, [group], "lookup", observedAt);
    await setCachedGroupMembershipActive(ownerId, groupId, membershipActive, observedAt);
    return { group, cookies: upstream.cookies };
}

export async function POST(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/actions">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const action = actionSchema.safeParse(await request.json().catch(() => null));
    if (!groupId.success || !action.success) return NextResponse.json({ error: "The group action is invalid." }, { status: 400 });

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const mutation = mutationFor(action.data, groupId.data, ownerId);
        const upstream = await requestVrchat<unknown>(mutation.endpoint, { method: mutation.method, cookies, ...(mutation.body ? { body: mutation.body } : {}) });
        const rotatedCookies = { ...cookies, ...upstream.cookies };
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);

        // VRCX re-fetches the group after each mutation. Keep the action
        // successful even if that non-essential refresh is temporarily blocked.
        try {
            const refreshed = await refreshGroup(ownerId, groupId.data, rotatedCookies);
            await persistRotatedVrchatCookies(refreshed.cookies, cookies.auth);
            return groupResponse({ success: true, group: refreshed.group });
        } catch {
            return groupResponse({ success: true, refreshRequired: true });
        }
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: error instanceof VrchatApiError ? error.message : "The group action could not be completed." }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}

function groupResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
