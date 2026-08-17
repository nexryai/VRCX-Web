import { describe, expect, it } from "vitest";

import { avatarActionSchema, avatarActionTargetError } from "./avatar-actions";

const ownerId = "usr_00000000-0000-0000-0000-000000000001";
const avatar = { id: "avtr_00000000-0000-0000-0000-000000000010", name: "Action Avatar", authorId: ownerId, tags: ["system_quest_fallback", "system_approved"] };

describe("Avatar Dialog remote action policy", () => {
    it("accepts only the fixed action union and rejects extra input", () => {
        expect(avatarActionSchema.safeParse({ action: "select-fallback" }).success).toBe(true);
        expect(avatarActionSchema.safeParse({ action: "delete-impostor" }).success).toBe(true);
        expect(avatarActionSchema.safeParse({ action: "arbitrary" }).success).toBe(false);
        expect(avatarActionSchema.safeParse({ action: "select", endpoint: "https://attacker.example" }).success).toBe(false);
    });

    it("requires a Quest tag for fallback and authorship for impostor maintenance", () => {
        expect(avatarActionTargetError("select-fallback", avatar, ownerId)).toBeNull();
        expect(avatarActionTargetError("select-fallback", { ...avatar, tags: [] }, ownerId)).toContain("Quest fallback");
        expect(avatarActionTargetError("enqueue-impostor", avatar, ownerId)).toBeNull();
        expect(avatarActionTargetError("delete-impostor", avatar, "usr_00000000-0000-0000-0000-000000000002")).toContain("avatar author");
        expect(avatarActionTargetError("regenerate-impostor", avatar, "usr_00000000-0000-0000-0000-000000000002")).toContain("avatar author");
    });
});
