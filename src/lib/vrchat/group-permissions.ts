import "server-only";

import { requestVrchat, VrchatApiError } from "./client";
import type { VrchatCookies } from "./protocol";
import { vrchatGroupSchema } from "./types";

export async function assertGroupPermission(groupId: string, permission: string, cookies: VrchatCookies) {
    const upstream = await requestVrchat<unknown>(`groups/${groupId}`, { cookies, query: { includeRoles: true } });
    const group = vrchatGroupSchema.parse(upstream.data);
    if (group.id !== groupId) throw new VrchatApiError("The group response did not match the requested group.", 502);
    const permissions = group.myMember?.permissions || [];
    if (!permissions.includes("*") && !permissions.includes(permission)) throw new VrchatApiError("You do not have permission to perform this group action.", 403);
    return { group, cookies: upstream.cookies };
}
