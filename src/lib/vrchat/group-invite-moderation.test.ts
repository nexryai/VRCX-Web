import { describe, expect, it } from "vitest";

import { groupInviteModerationActionSchema, groupInviteModerationMutation } from "./group-invite-moderation";

const groupId = "grp_00000000-0000-0000-0000-000000000001";
const userId = "usr_00000000-0000-0000-0000-000000000002";

describe("group invite moderation", () => {
    it("accepts only exact actions", () => {
        expect(groupInviteModerationActionSchema.parse({ action: "block" })).toEqual({ action: "block" });
        expect(groupInviteModerationActionSchema.safeParse({ action: "block", extra: true }).success).toBe(false);
    });

    it("maps every VRCX action to a fixed endpoint", () => {
        expect(groupInviteModerationMutation(groupId, userId, "delete-invite")).toEqual({ endpoint: `groups/${groupId}/invites/${userId}`, method: "DELETE" });
        expect(groupInviteModerationMutation(groupId, userId, "accept")).toEqual({ endpoint: `groups/${groupId}/requests/${userId}`, method: "PUT", query: { action: "accept" } });
        expect(groupInviteModerationMutation(groupId, userId, "block")).toEqual({ endpoint: `groups/${groupId}/requests/${userId}`, method: "PUT", query: { action: "reject", block: true } });
        expect(groupInviteModerationMutation(groupId, userId, "delete-blocked")).toEqual({ endpoint: `groups/${groupId}/members/${userId}`, method: "DELETE" });
    });
});
