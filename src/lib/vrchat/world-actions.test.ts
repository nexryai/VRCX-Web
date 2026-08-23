import { describe, expect, it } from "vitest";

import { optimisticWorldAfterAction, worldActionOwnershipError, worldActionSchema } from "./world-actions";

const ownerId = "usr_00000000-0000-0000-0000-000000000001";
const worldId = "wrld_00000000-0000-0000-0000-000000000010";
const world = { id: worldId, name: "Owned World", authorId: ownerId, releaseStatus: "public", tags: ["system_labs", "content_horror"] };

describe("World action policy", () => {
    it("accepts only the fixed action union", () => {
        expect(worldActionSchema.safeParse({ action: "publish" }).success).toBe(true);
        expect(worldActionSchema.safeParse({ action: "unpublish" }).success).toBe(true);
        expect(worldActionSchema.safeParse({ action: "delete" }).success).toBe(true);
        expect(worldActionSchema.safeParse({ action: "rename" }).success).toBe(false);
        expect(worldActionSchema.safeParse({ action: "delete", endpoint: "users" }).success).toBe(false);
    });

    it("requires the authoritative world and owner", () => {
        expect(worldActionOwnershipError(world, worldId, ownerId)).toBeNull();
        expect(worldActionOwnershipError(world, "wrld_00000000-0000-0000-0000-000000000099", ownerId)).toContain("author");
        expect(worldActionOwnershipError(world, worldId, "usr_00000000-0000-0000-0000-000000000002")).toContain("author");
    });

    it("keeps a truthful fallback publication projection", () => {
        expect(optimisticWorldAfterAction({ ...world, tags: ["content_horror"] }, "publish")).toMatchObject({ releaseStatus: "public", tags: ["content_horror", "system_labs"] });
        expect(optimisticWorldAfterAction(world, "unpublish")).toMatchObject({ releaseStatus: "private", tags: ["content_horror"] });
    });
});
