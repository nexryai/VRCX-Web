import { describe, expect, it } from "vitest";

import { normalizeNote, noteExportItemsSchema, noteExportResponseSchema } from "./note-export";

describe("VRCX note export boundary", () => {
    it("replaces every line break and applies the VRChat note limit", () => {
        expect(normalizeNote(` first\r\nsecond ${"x".repeat(300)}`)).toBe(` first  second ${"x".repeat(241)}`);
        expect(normalizeNote(" ")).toBe(" ");
    });

    it("accepts unique canonical friend notes only", () => {
        const userId = "usr_00000000-0000-0000-0000-000000000001";
        expect(noteExportItemsSchema.safeParse([{ userId, note: "Memo" }]).success).toBe(true);
        expect(
            noteExportItemsSchema.safeParse([
                { userId, note: "A" },
                { userId, note: "B" },
            ]).success,
        ).toBe(false);
        expect(noteExportItemsSchema.safeParse([{ userId: "usr_bad", note: "Memo" }]).success).toBe(false);
        expect(noteExportItemsSchema.safeParse([{ userId, note: "x".repeat(257) }]).success).toBe(false);
    });

    it("strictly validates the browser status response", () => {
        const response = { candidates: [], job: { status: "running", processed: 1, total: 2 } };
        expect(noteExportResponseSchema.safeParse(response).success).toBe(true);
        expect(noteExportResponseSchema.safeParse({ ...response, secret: "no" }).success).toBe(false);
    });
});
