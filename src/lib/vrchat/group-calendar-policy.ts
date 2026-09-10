import "server-only";

import { requestVrchat, VrchatApiError } from "./client";
import { validatePersonalGalleryFiles } from "./gallery-files";
import type { GroupCalendarEventInput } from "./group-calendar-event";
import { assertGroupPermission } from "./group-permissions";
import type { VrchatCookies } from "./protocol";

export async function assertGroupCalendarEventPolicy(groupId: string, input: GroupCalendarEventInput | null, ownerId: string, cookies: VrchatCookies) {
    const permission = await assertGroupPermission(groupId, "group-calendar-manage", cookies);
    Object.assign(cookies, permission.cookies);
    if (!input) return permission.group;

    const validRoleIds = new Set((permission.group.roles || []).map((role) => role.id));
    if (input.roleIds.some((roleId) => !validRoleIds.has(roleId))) throw new VrchatApiError("A selected event role does not belong to this group.", 400);
    if (permission.group.privacy !== "default" && input.accessType === "public") throw new VrchatApiError("Private groups cannot create public events.", 400);

    if (input.imageId) {
        const galleryResponse = await requestVrchat<unknown>("files", { cookies, query: { tag: "gallery", n: 100, offset: 0 } });
        Object.assign(cookies, galleryResponse.cookies);
        const files = validatePersonalGalleryFiles(galleryResponse.data, ownerId);
        if (!files.some((file) => file.id === input.imageId)) throw new VrchatApiError("The selected event image is not in your personal gallery.", 400);
    }
    return permission.group;
}
