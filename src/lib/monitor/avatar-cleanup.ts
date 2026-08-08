import "server-only";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";

const DAY_MS = 24 * 60 * 60 * 1_000;
const AUTO_CLEANUP_INTERVAL_MS = 7 * DAY_MS;

export type AvatarCleanupDays = 30 | 90 | 180 | 365 | 730;

export type AvatarCleanupResult = {
    ran: boolean;
    days: AvatarCleanupDays | null;
    cutoff?: Date;
    deleted: number;
};

/**
 * Ported from VRCX/src/services/database/feed.js purgeAvatarFeedData.
 * Only avatar-change feed rows are eligible; other remote history and all
 * current projections remain authoritative and are never touched here.
 */
export async function purgeAvatarFeedData(ownerId: string, days: AvatarCleanupDays | null, now = new Date(), automatic = false): Promise<AvatarCleanupResult> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const cutoff = days === null ? undefined : new Date(now.getTime() - days * DAY_MS);
    try {
        const result = await c.activityEvents.deleteMany({ ownerId, type: "Avatar", ...(cutoff ? { occurredAt: { $lt: cutoff } } : {}) });
        await c.monitorState.updateOne(
            { _id: "singleton", ownerId },
            {
                $set: { lastAvatarCleanupAt: now, ...(automatic ? { lastAvatarAutoCleanupAt: now } : {}), lastAvatarCleanupDeleted: result.deletedCount, updatedAt: now },
                $unset: { lastAvatarCleanupError: "" },
            },
        );
        return { ran: true, days, ...(cutoff ? { cutoff } : {}), deleted: result.deletedCount };
    } catch (error) {
        await c.monitorState.updateOne(
            { _id: "singleton", ownerId },
            {
                $set: { lastAvatarCleanupError: "Avatar feed cleanup failed.", updatedAt: now },
            },
        );
        throw error;
    }
}

export async function runAvatarAutoCleanup(ownerId: string, now = new Date()): Promise<AvatarCleanupResult> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const [settings, monitorState] = await Promise.all([c.appSettings.findOne({ _id: "singleton" }, { projection: { activeUserId: 1, avatarAutoCleanupDays: 1 } }), c.monitorState.findOne({ _id: "singleton", ownerId }, { projection: { lastAvatarAutoCleanupAt: 1 } })]);
    const days = settings?.avatarAutoCleanupDays ?? 0;
    if (settings?.activeUserId !== ownerId || days === 0) return { ran: false, days: null, deleted: 0 };
    if (monitorState?.lastAvatarAutoCleanupAt && now.getTime() - monitorState.lastAvatarAutoCleanupAt.getTime() < AUTO_CLEANUP_INTERVAL_MS) {
        return { ran: false, days, deleted: 0 };
    }
    return purgeAvatarFeedData(ownerId, days, now, true);
}
