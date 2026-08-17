import { describe, expect, it } from "vitest";

import { avatarOwnershipError, avatarUpdateSchema, buildAvatarUpstreamUpdate } from "./avatar-metadata";

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

    it("replaces only the requested tag namespaces", () => {
        const current = { ...avatar, tags: ["system_approved", "content_horror", "author_tag_old", "system_quest_fallback"] };
        const content = buildAvatarUpstreamUpdate(current, { contentTags: ["gore", "featured"] });
        expect(content.upstream.tags).toEqual(["system_approved", "author_tag_old", "system_quest_fallback", "content_gore", "content_featured"]);
        const author = buildAvatarUpstreamUpdate(content.optimistic, { authorTags: ["dance", "dance"] });
        expect(author.upstream.tags).toEqual(["system_approved", "system_quest_fallback", "content_gore", "content_featured", "author_tag_dance"]);
    });

    it("maps selected style names only through the available style list", () => {
        const styles = [
            { id: "avst_00000000-0000-0000-0000-000000000021", styleName: "Human" },
            { id: "avst_00000000-0000-0000-0000-000000000022", styleName: "Realistic" },
        ];
        const mutation = buildAvatarUpstreamUpdate(avatar, { styles: { primary: "Realistic", secondary: "Human" } }, styles);
        expect(mutation.upstream).toMatchObject({ primaryStyle: styles[1].id, secondaryStyle: styles[0].id });
        expect(mutation.optimistic.styles).toEqual({ primary: "Realistic", secondary: "Human" });
        expect(() => buildAvatarUpstreamUpdate(avatar, { styles: { primary: "Unknown", secondary: "" } }, styles)).toThrow("unavailable");
    });

    it("requires the authoritative avatar ID and author to match", () => {
        expect(avatarOwnershipError(avatar, avatarId, ownerId, "update")).toBeNull();
        expect(avatarOwnershipError(avatar, "avtr_00000000-0000-0000-0000-000000000099", ownerId, "update")).toBe("Only the avatar author can update it.");
        expect(avatarOwnershipError(avatar, avatarId, "usr_00000000-0000-0000-0000-000000000002", "delete")).toBe("Only the avatar author can delete it.");
    });
});
