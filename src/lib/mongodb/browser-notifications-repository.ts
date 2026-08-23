import "server-only";

import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function claimBrowserNotifications(ownerId: string, deliveredAt = new Date(), limit = 10) {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const settings = await c.appSettings.findOne({ _id: "singleton" }, { projection: { activeUserId: 1, browserNotificationsEnabled: 1, browserNotificationsEnabledAt: 1 } });
    if (settings?.activeUserId !== ownerId || settings.browserNotificationsEnabled !== true || !settings.browserNotificationsEnabledAt) return [];

    const claimed = [];
    for (let index = 0; index < limit; index += 1) {
        const document = await c.notifications.findOneAndUpdate(
            {
                ownerId,
                source: { $in: ["legacy", "v2"] },
                firstObservedAt: { $gte: settings.browserNotificationsEnabledAt },
                browserDeliveredAt: { $exists: false },
            },
            { $set: { browserDeliveredAt: deliveredAt, updatedAt: deliveredAt } },
            { sort: { firstObservedAt: 1 }, returnDocument: "after" },
        );
        if (!document) break;
        claimed.push(document.notification);
    }
    return claimed;
}
