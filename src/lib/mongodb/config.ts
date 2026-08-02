import "server-only";

import { z } from "zod";

const mongoEnvironmentSchema = z.object({
    MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required."),
    MONGODB_DATABASE: z.string().trim().min(1).default("vrcx"),
});

export type MongoConfig = {
    uri: string;
    database: string;
};

let cachedConfig: MongoConfig | undefined;

/**
 * MongoDB is intentionally required at runtime: silently falling back to
 * browser or process memory would split the single authoritative data store.
 */
export function getMongoConfig(): MongoConfig {
    if (cachedConfig) return cachedConfig;

    const parsed = mongoEnvironmentSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
    }

    cachedConfig = {
        uri: parsed.data.MONGODB_URI,
        database: parsed.data.MONGODB_DATABASE,
    };
    return cachedConfig;
}
