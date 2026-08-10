import "server-only";

import { z } from "zod";

import { VrchatApiError } from "./client";
import { assertGroupPermission } from "./group-permissions";
import { fileIdSchema, groupPostIdSchema, groupRoleIdSchema } from "./ids";
import type { VrchatCookies } from "./protocol";
import { type VrchatGroupPost, vrchatGroupPostSchema } from "./types";

const titleSchema = z.string().min(1).max(1_024);
const textSchema = z.string().min(1).max(10_000);
const roleIdsSchema = z
    .array(groupRoleIdSchema)
    .max(256)
    .refine((roleIds) => new Set(roleIds).size === roleIds.length, "Role IDs must be unique.");
const imageIdSchema = fileIdSchema.nullable().optional();

const editableFields = {
    title: titleSchema,
    text: textSchema,
    roleIds: roleIdsSchema,
    visibility: z.enum(["group", "public"]),
    imageId: imageIdSchema,
};

export const createGroupPostRequestSchema = z.object({ ...editableFields, sendNotification: z.boolean() }).strict();
export const editGroupPostRequestSchema = z.object(editableFields).strict();

export async function assertGroupPostPermission(groupId: string, requestedRoleIds: string[], cookies: VrchatCookies) {
    const upstream = await assertGroupPermission(groupId, "group-announcement-manage", cookies);
    const group = upstream.group;
    const roleIds = new Set((group.roles || []).map((role) => role.id));
    if (requestedRoleIds.some((roleId) => !roleIds.has(roleId))) {
        throw new VrchatApiError("A selected post role does not belong to this group.", 400);
    }
    return upstream;
}

export function parseGroupPostForGroup(value: unknown, groupId: string, expectedPostId?: string): VrchatGroupPost {
    const post = vrchatGroupPostSchema.parse(value);
    const postId = groupPostIdSchema.parse(post.id);
    if (expectedPostId && postId !== expectedPostId) throw new Error("The group post response did not match the requested post.");
    if (post.groupId && post.groupId !== groupId) throw new Error("The group post response did not match the requested group.");
    return post;
}
