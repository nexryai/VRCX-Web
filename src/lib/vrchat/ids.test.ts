import { describe, expect, it } from "vitest";

import { isAllowedVrchatEndpoint } from "./client";
import { avatarIdSchema, favoriteObjectIdSchema, groupGalleryIdSchema, groupGalleryImageIdSchema, groupIdSchema, isVrchatId, localFavoriteGroupIdSchema, userIdSchema, worldIdSchema } from "./ids";

describe("VRChat entity ID boundary", () => {
    const uuid = "00000000-0000-0000-0000-000000000001";

    it("accepts canonical entity and local favorite group IDs", () => {
        expect(userIdSchema.parse(`usr_${uuid}`)).toBe(`usr_${uuid}`);
        expect(worldIdSchema.parse(`wrld_${uuid}`)).toBe(`wrld_${uuid}`);
        expect(avatarIdSchema.parse(`avtr_${uuid}`)).toBe(`avtr_${uuid}`);
        expect(groupIdSchema.parse(`grp_${uuid}`)).toBe(`grp_${uuid}`);
        expect(groupGalleryIdSchema.parse(`ggal_${uuid}`)).toBe(`ggal_${uuid}`);
        expect(groupGalleryImageIdSchema.parse(`ggim_${uuid}`)).toBe(`ggim_${uuid}`);
        expect(localFavoriteGroupIdSchema.parse(`lfg_${uuid}`)).toBe(`lfg_${uuid}`);
        expect(favoriteObjectIdSchema.safeParse(`grp_${uuid}`).success).toBe(false);
        expect(isVrchatId(`grp_${uuid}`)).toBe(true);
    });

    it("rejects misplaced, missing, repeated, or trailing separators", () => {
        for (const malformed of ["usr_000000000000-0000-0000-000000000001", "usr_00000000-0000-0000-00000000000-1", "usr_00000000--0000-0000-0000-000000000001", "usr_00000000-0000-0000-0000-000000000001-"]) {
            expect(userIdSchema.safeParse(malformed).success).toBe(false);
            expect(isVrchatId(malformed)).toBe(false);
        }
    });

    it("applies the same canonical boundary to upstream endpoint allowlists", () => {
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`groups/grp_${uuid}/members/usr_${uuid}`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/instances/groups/grp_${uuid}`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/instances/groups`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`users/usr_${uuid}/instances/groups/grp_${uuid}/extra`)).toBe(false);
        expect(isAllowedVrchatEndpoint(`calendar/grp_${uuid}`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`calendar/grp_${uuid}/evt_example/follow`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`calendar/grp_${uuid}/evt_example/follow/extra`)).toBe(false);
        expect(isAllowedVrchatEndpoint(`groups/grp_${uuid}/galleries/ggal_${uuid}`)).toBe(true);
        expect(isAllowedVrchatEndpoint(`groups/grp_${uuid}/galleries/ggal_${uuid}/images`)).toBe(false);
        expect(isAllowedVrchatEndpoint("users/usr_000000000000-0000-0000-000000000001")).toBe(false);
        expect(isAllowedVrchatEndpoint(`worlds/wrld_${uuid}-suffix`)).toBe(false);
    });
});
