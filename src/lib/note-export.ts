import { z } from "zod";

import { userIdSchema } from "@/lib/vrchat/ids";

export function normalizeNote(value: string) {
    return value.replace(/[\r\n]/g, " ").slice(0, 256);
}

export const noteExportItemsSchema = z
    .array(
        z
            .object({
                userId: userIdSchema,
                note: z.string().max(256).transform(normalizeNote),
            })
            .strict(),
    )
    .min(1)
    .max(10_000)
    .refine((items) => new Set(items.map((item) => item.userId)).size === items.length);

export const noteExportCandidateSchema = z
    .object({
        userId: userIdSchema,
        displayName: z.string(),
        imageUrl: z.string().optional(),
        note: z.string().max(256),
    })
    .strict();

export const noteExportResponseSchema = z
    .object({
        candidates: z.array(noteExportCandidateSchema),
        job: z
            .object({
                status: z.enum(["cancelled", "complete", "error", "queued", "running"]),
                processed: z.number().int().nonnegative(),
                total: z.number().int().nonnegative(),
                error: z.string().optional(),
            })
            .strict(),
    })
    .strict();

export type NoteExportCandidate = z.infer<typeof noteExportCandidateSchema>;
export type NoteExportStartItem = z.infer<typeof noteExportItemsSchema>[number];
export type NoteExportResponse = z.infer<typeof noteExportResponseSchema>;
