import { describe, expect, it } from "vitest";

import { vrchatAvatarModerationSchema } from "./types";

const avatarId = "avtr_00000000-0000-0000-0000-000000000010";

describe("VRChat avatar moderation parsing", () => {
    it("accepts the timestamp shapes returned by list and create", () => {
        expect(vrchatAvatarModerationSchema.parse({ avatarModerationType: "block", created: "2026-08-17T12:00:00.000Z", targetAvatarId: avatarId })).toMatchObject({ targetAvatarId: avatarId });
        expect(vrchatAvatarModerationSchema.parse({ avatarModerationType: "block", created: 1_776_600_000_000, targetAvatarId: avatarId })).toMatchObject({ created: 1_776_600_000_000 });
    });

    it("rejects unsupported moderation types and non-avatar targets", () => {
        expect(vrchatAvatarModerationSchema.safeParse({ avatarModerationType: "hide", created: "2026-08-17T12:00:00.000Z", targetAvatarId: avatarId }).success).toBe(false);
        expect(vrchatAvatarModerationSchema.safeParse({ avatarModerationType: "block", created: "2026-08-17T12:00:00.000Z", targetAvatarId: "usr_00000000-0000-0000-0000-000000000010" }).success).toBe(false);
    });
});
