import "server-only";

import { z } from "zod";

export const groupInviteModerationActionSchema = z.object({ action: z.enum(["delete-invite", "accept", "reject", "block", "delete-blocked"]) }).strict();
export type GroupInviteModerationAction = z.infer<typeof groupInviteModerationActionSchema>["action"];

export function groupInviteModerationMutation(groupId: string, userId: string, action: GroupInviteModerationAction) {
    switch (action) {
        case "delete-invite":
            return { endpoint: `groups/${groupId}/invites/${userId}`, method: "DELETE" as const };
        case "accept":
            return { endpoint: `groups/${groupId}/requests/${userId}`, method: "PUT" as const, query: { action: "accept" } };
        case "reject":
            return { endpoint: `groups/${groupId}/requests/${userId}`, method: "PUT" as const, query: { action: "reject" } };
        case "block":
            return { endpoint: `groups/${groupId}/requests/${userId}`, method: "PUT" as const, query: { action: "reject", block: true } };
        case "delete-blocked":
            return { endpoint: `groups/${groupId}/members/${userId}`, method: "DELETE" as const };
    }
}
