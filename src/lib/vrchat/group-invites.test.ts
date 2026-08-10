import { describe, expect, it } from "vitest";

import { groupInviteRequestSchema } from "./group-invites";

describe("group invitation boundary", () => {
    const userId = "usr_00000000-0000-0000-0000-000000000001";

    it("accepts unique canonical user IDs", () => {
        expect(groupInviteRequestSchema.parse({ userIds: [userId] })).toEqual({ userIds: [userId] });
    });

    it("rejects empty, duplicate, malformed, or extra fields", () => {
        expect(groupInviteRequestSchema.safeParse({ userIds: [] }).success).toBe(false);
        expect(groupInviteRequestSchema.safeParse({ userIds: [userId, userId] }).success).toBe(false);
        expect(groupInviteRequestSchema.safeParse({ userIds: ["usr_bad"] }).success).toBe(false);
        expect(groupInviteRequestSchema.safeParse({ userIds: [userId], groupId: "grp_bad" }).success).toBe(false);
    });
});
