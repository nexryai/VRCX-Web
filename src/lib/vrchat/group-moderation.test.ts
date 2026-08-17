import { afterEach, describe, expect, it, vi } from "vitest";

import { assertGroupMemberModerationPermission, groupMemberModerationMutation, groupMemberModerationRequestSchema, groupMemberMutationRemovesMembership } from "./group-moderation";

const uuid = "00000000-0000-0000-0000-000000000001";
const groupId = `grp_${uuid}`;
const userId = `usr_${uuid}`;
const roleId = `grol_${uuid}`;

afterEach(() => vi.unstubAllGlobals());

describe("group member moderation boundaries", () => {
    it("accepts only VRCX member moderation fields", () => {
        expect(groupMemberModerationRequestSchema.parse({ action: "set-note", note: "Reviewed" })).toEqual({ action: "set-note", note: "Reviewed" });
        expect(groupMemberModerationRequestSchema.parse({ action: "add-role", roleId })).toEqual({ action: "add-role", roleId });
        expect(groupMemberModerationRequestSchema.safeParse({ action: "kick", note: "extra" }).success).toBe(false);
        expect(groupMemberModerationRequestSchema.safeParse({ action: "add-role", roleId: "grol_bad" }).success).toBe(false);
    });

    it("maps each action to an allowlistable upstream mutation", () => {
        expect(groupMemberModerationMutation(groupId, userId, { action: "set-note", note: "Reviewed" })).toEqual({ endpoint: `groups/${groupId}/members/${userId}`, method: "PUT", body: { managerNotes: "Reviewed" } });
        expect(groupMemberModerationMutation(groupId, userId, { action: "ban" })).toEqual({ endpoint: `groups/${groupId}/bans`, method: "POST", body: { userId } });
        expect(groupMemberModerationMutation(groupId, userId, { action: "unban" })).toEqual({ endpoint: `groups/${groupId}/bans/${userId}`, method: "DELETE" });
        expect(groupMemberModerationMutation(groupId, userId, { action: "add-role", roleId })).toEqual({ endpoint: `groups/${groupId}/members/${userId}/roles/${roleId}`, method: "PUT" });
        expect(groupMemberMutationRemovesMembership({ action: "kick" })).toBe(true);
        expect(groupMemberMutationRemovesMembership({ action: "set-note", note: "" })).toBe(false);
    });

    it("checks the exact permission and group-owned role", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ id: groupId, name: "Test Group", roles: [{ id: roleId, name: "Moderator" }], myMember: { permissions: ["group-roles-assign"] } })),
        );
        await expect(assertGroupMemberModerationPermission(groupId, { action: "add-role", roleId }, { auth: "current" })).resolves.toMatchObject({ group: { id: groupId } });
        await expect(assertGroupMemberModerationPermission(groupId, { action: "add-role", roleId: `grol_00000000-0000-0000-0000-000000000002` }, { auth: "current" })).rejects.toMatchObject({ status: 400 });
    });

    it("rejects a different moderation capability", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ id: groupId, name: "Test Group", roles: [], myMember: { permissions: ["group-members-manage"] } })),
        );
        await expect(assertGroupMemberModerationPermission(groupId, { action: "ban" }, { auth: "current" })).rejects.toMatchObject({ status: 403 });
    });
});
