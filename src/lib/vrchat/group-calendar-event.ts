import { z } from "zod";

import { fileIdSchema, groupRoleIdSchema } from "./ids";
import { vrchatGroupCalendarRecurrenceSchema } from "./types";

export const groupCalendarCategories = ["arts", "avatars", "dance", "education", "exploration", "film_media", "gaming", "hangout", "music", "other", "performance", "roleplaying", "wellness"] as const;
export const groupCalendarPlatforms = ["android", "ios", "standalonewindows"] as const;
export const groupCalendarWeekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const uniqueArray = <T extends z.ZodType>(schema: T, max: number) =>
    z
        .array(schema)
        .max(max)
        .refine((values) => new Set(values).size === values.length);

export const groupCalendarEventInputSchema = z
    .object({
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        title: z.string().trim().min(1).max(64),
        accessType: z.enum(["group", "public"]),
        description: z.string().trim().min(1).max(1024),
        category: z.enum(groupCalendarCategories),
        tags: uniqueArray(z.string().trim().min(1).max(100), 5),
        imageId: fileIdSchema.nullable(),
        roleIds: uniqueArray(groupRoleIdSchema, 100),
        platforms: uniqueArray(z.enum(groupCalendarPlatforms), 3),
        languages: uniqueArray(z.string().regex(/^[a-z]{2,8}$/i), 3),
        sendCreationNotification: z.boolean(),
        hostEarlyJoinMinutes: z.number().int().min(0).max(60),
        guestEarlyJoinMinutes: z.number().int().min(0).max(60),
        closeInstanceAfterEndMinutes: z.number().int().min(0).max(60),
        occurrenceKind: z.literal("series").optional(),
        recurrence: vrchatGroupCalendarRecurrenceSchema.strict().optional(),
    })
    .strict()
    .superRefine((value, context) => {
        if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "The event must end after it starts." });
        if ((value.occurrenceKind === "series") !== Boolean(value.recurrence)) context.addIssue({ code: "custom", path: ["recurrence"], message: "Series events require recurrence settings." });
        if (value.recurrence?.frequency !== "weekly" && value.recurrence?.daysOfWeek?.length) context.addIssue({ code: "custom", path: ["recurrence", "daysOfWeek"], message: "Only weekly events can select weekdays." });
        if (value.recurrence?.end?.type === "afterDate" && !Number.isFinite(Date.parse(value.recurrence.end.date))) context.addIssue({ code: "custom", path: ["recurrence", "end", "date"], message: "The recurrence end date is invalid." });
    });

export type GroupCalendarEventInput = z.infer<typeof groupCalendarEventInputSchema>;

export function groupCalendarEventUpstreamBody(input: GroupCalendarEventInput) {
    return groupCalendarEventInputSchema.parse(input);
}
