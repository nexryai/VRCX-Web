import { z } from "zod";

import { userIdSchema } from "./ids";

export const groupInviteRequestSchema = z
    .object({
        userIds: z
            .array(userIdSchema)
            .min(1)
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length, "User IDs must be unique."),
    })
    .strict();
