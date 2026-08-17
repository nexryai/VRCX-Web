import { describe, expect, it } from "vitest";

import { avatarOwnershipError, avatarUpdateSchema } from "./avatar-metadata";

const ownerId = "usr_00000000-0000-0000-0000-000000000001";
const avatarId = "avtr_00000000-0000-0000-0000-000000000010";
const avatar = { id: avatarId, name: "Owned Avatar", authorId: ownerId };

describe("Avatar metadata mutation policy", () => {
    it("accepts only supported non-empty avatar changes", () => {
        expect(avatarUpdateSchema.safeParse({ name: "Renamed Avatar" }).success).toBe(true);
        expect(avatarUpdateSchema.safeParse({ description: "Updated description" }).success).toBe(true);
        expect(avatarUpdateSchema.safeParse({ releaseStatus: "public" }).success).toBe(true);
        expect(avatarUpdateSchema.safeParse({}).success).toBe(false);
        expect(avatarUpdateSchema.safeParse({ description: "" }).success).toBe(false);
    });

    it("rejects extra fields and unsupported release states", () => {
        expect(avatarUpdateSchema.safeParse({ name: "Owned Avatar", authorId: ownerId }).success).toBe(false);
        expect(avatarUpdateSchema.safeParse({ releaseStatus: "hidden" }).success).toBe(false);
    });

    it("requires the authoritative avatar ID and author to match", () => {
        expect(avatarOwnershipError(avatar, avatarId, ownerId, "update")).toBeNull();
        expect(avatarOwnershipError(avatar, "avtr_00000000-0000-0000-0000-000000000099", ownerId, "update")).toBe("Only the avatar author can update it.");
        expect(avatarOwnershipError(avatar, avatarId, "usr_00000000-0000-0000-0000-000000000002", "delete")).toBe("Only the avatar author can delete it.");
    });
});
