import { afterEach, describe, expect, it, vi } from "vitest";

import { assertGroupPostPermission, createGroupPostRequestSchema, editGroupPostRequestSchema, parseGroupPostForGroup } from "./group-posts";

const uuid = "00000000-0000-0000-0000-000000000001";
const groupId = `grp_${uuid}`;
const postId = `gpos_${uuid}`;
const roleId = `grol_${uuid}`;

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("group post boundaries", () => {
    it("accepts the VRCX create/edit fields and rejects extra or repeated role IDs", () => {
        const editable = { title: "Meetup", text: "Starting now", roleIds: [roleId], visibility: "group" as const, imageId: `file_${uuid}` };
        expect(createGroupPostRequestSchema.parse({ ...editable, sendNotification: true })).toEqual({ ...editable, sendNotification: true });
        expect(editGroupPostRequestSchema.parse(editable)).toEqual(editable);
        expect(editGroupPostRequestSchema.safeParse({ ...editable, sendNotification: true }).success).toBe(false);
        expect(createGroupPostRequestSchema.safeParse({ ...editable, roleIds: [roleId, roleId], sendNotification: true }).success).toBe(false);
    });

    it("requires a canonical post ID and matching group ownership", () => {
        expect(parseGroupPostForGroup({ id: postId, groupId, title: "Meetup", text: "Now" }, groupId, postId)).toMatchObject({ id: postId, visibility: "group", roleIds: [] });
        expect(() => parseGroupPostForGroup({ id: "gpos_bad", groupId, title: "Meetup", text: "Now" }, groupId)).toThrow();
        expect(() => parseGroupPostForGroup({ id: postId, groupId: `grp_00000000-0000-0000-0000-000000000002`, title: "Meetup", text: "Now" }, groupId)).toThrow();
    });

    it("checks the authoritative myMember permission and requested group roles", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    id: groupId,
                    name: "Test Group",
                    roles: [{ id: roleId, name: "Everyone" }],
                    myMember: { permissions: ["group-announcement-manage"] },
                }),
            ),
        );
        await expect(assertGroupPostPermission(groupId, [roleId], { auth: "current" })).resolves.toMatchObject({ group: { id: groupId } });
        await expect(assertGroupPostPermission(groupId, [`grol_00000000-0000-0000-0000-000000000002`], { auth: "current" })).rejects.toMatchObject({ status: 400 });
    });

    it("rejects members without announcement management permission", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ id: groupId, name: "Test Group", roles: [], myMember: { permissions: [] } })),
        );
        await expect(assertGroupPostPermission(groupId, [], { auth: "current" })).rejects.toMatchObject({ status: 403 });
    });
});
