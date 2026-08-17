import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getCachedGroupAuditLogs, replaceCachedGroupAuditLogs } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { assertGroupPermission } from "@/lib/vrchat/group-permissions";
import { groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupAuditLogResponseSchema } from "@/lib/vrchat/types";

const eventTypeSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9._-]+$/i);

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/moderation/logs">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    const parsedTypes = z.array(eventTypeSchema).max(50).safeParse(request.nextUrl.searchParams.getAll("eventType"));
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!groupId.success || !parsedTypes.success) return response({ error: "The group audit-log request is invalid." }, 400);
    const eventTypes = Array.from(new Set(parsedTypes.data)).toSorted();
    const filterKey = eventTypes.length ? eventTypes.join("+") : "all";
    const ownerId = await requireActiveUserId();
    if (!refresh) {
        const cached = await getCachedGroupAuditLogs(ownerId, groupId.data, filterKey);
        if (cached) return response({ ...cached, cached: true });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const permission = await assertGroupPermission(groupId.data, "group-audit-view", cookies);
        Object.assign(cookies, permission.cookies);
        const typesResponse = await requestVrchat<unknown>(`groups/${groupId.data}/auditLogTypes`, { cookies });
        Object.assign(cookies, typesResponse.cookies);
        const availableEventTypes = z.array(eventTypeSchema).parse(typesResponse.data);
        const allowed = new Set(availableEventTypes);
        if (eventTypes.some((type) => !allowed.has(type))) return response({ error: "An audit-log type is not available for this group." }, 400);
        const logs = [];
        let truncated = false;
        for (let offset = 0, page = 0; page < 50; page += 1, offset += 100) {
            // The upstream contract defines eventTypes as one comma-separated
            // query string even though VRCX stores the selection as an array.
            const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/auditLogs`, { cookies, query: { n: 100, offset, ...(eventTypes.length ? { eventTypes: eventTypes.join(",") } : {}) } });
            Object.assign(cookies, upstream.cookies);
            const parsed = vrchatGroupAuditLogResponseSchema.parse(upstream.data);
            logs.push(...parsed.results);
            if (!parsed.hasNext) break;
            if (page === 49) truncated = true;
        }
        const unique = Array.from(new Map(logs.map((log) => [log.id, log])).values());
        await replaceCachedGroupAuditLogs(ownerId, groupId.data, filterKey, eventTypes, availableEventTypes, unique, truncated);
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return response({ eventTypes, availableEventTypes, logs: unique, truncated, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group audit-log response was not valid." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
