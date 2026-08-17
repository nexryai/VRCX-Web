import "server-only";

import { z } from "zod";

import { VrchatApiError } from "./client";
import { assertGroupPermission } from "./group-permissions";
import { groupRoleIdSchema } from "./ids";
import type { VrchatCookies } from "./protocol";

export const groupMemberModerationRequestSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("set-note"), note: z.string().max(2_048) }).strict(),
    z.object({ action: z.enum(["ban", "kick", "unban"]) }).strict(),
    z.object({ action: z.enum(["add-role", "remove-role"]), roleId: groupRoleIdSchema }).strict(),
]);

export type GroupMemberModerationRequest = z.infer<typeof groupMemberModerationRequestSchema>;

const permissionByAction: Record<GroupMemberModerationRequest["action"], string> = {
    "set-note": "group-members-manage",
    "add-role": "group-roles-assign",
    "remove-role": "group-roles-assign",
    kick: "group-members-remove",
    ban: "group-bans-manage",
    unban: "group-bans-manage",
};

export async function assertGroupMemberModerationPermission(groupId: string, action: GroupMemberModerationRequest, cookies: VrchatCookies) {
    const upstream = await assertGroupPermission(groupId, permissionByAction[action.action], cookies);
    if (action.action === "add-role" || action.action === "remove-role") {
        const roleIds = new Set((upstream.group.roles || []).map((role) => role.id));
        if (!roleIds.has(action.roleId)) throw new VrchatApiError("The selected role does not belong to this group.", 400);
    }
    return upstream;
}

export function groupMemberModerationMutation(groupId: string, userId: string, action: GroupMemberModerationRequest) {
    switch (action.action) {
        case "set-note":
            return { endpoint: `groups/${groupId}/members/${userId}`, method: "PUT" as const, body: { managerNotes: action.note } };
        case "kick":
            return { endpoint: `groups/${groupId}/members/${userId}`, method: "DELETE" as const };
        case "ban":
            return { endpoint: `groups/${groupId}/bans`, method: "POST" as const, body: { userId } };
        case "unban":
            return { endpoint: `groups/${groupId}/bans/${userId}`, method: "DELETE" as const };
        case "add-role":
            return { endpoint: `groups/${groupId}/members/${userId}/roles/${action.roleId}`, method: "PUT" as const };
        case "remove-role":
            return { endpoint: `groups/${groupId}/members/${userId}/roles/${action.roleId}`, method: "DELETE" as const };
    }
}

export function groupMemberMutationRemovesMembership(action: GroupMemberModerationRequest) {
    return action.action === "kick" || action.action === "ban";
}
