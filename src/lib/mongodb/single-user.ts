import "server-only";

import { VrchatApiError } from "@/lib/vrchat/client";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function requireActiveUserId(): Promise<string> {
    await ensureMongoSchema();
    const settings = await collections(await getMongoDatabase()).appSettings.findOne({ _id: "singleton" }, { projection: { activeUserId: 1 } });
    if (!settings?.activeUserId) throw new VrchatApiError("Sign in to continue.", 401);
    return settings.activeUserId;
}
