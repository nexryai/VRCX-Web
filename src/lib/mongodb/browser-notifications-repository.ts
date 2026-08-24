import "server-only";

import { serializeAppSettings } from "@/lib/app-settings";
import { activityDelivery, type BrowserActivity, type BrowserNotificationDelivery, notificationDelivery } from "@/lib/browser-notifications";
import { listSelectedFavoriteFriendIds } from "@/lib/mongodb/friend-favorites-repository";
import { defaultNotificationDeliveryFilters, isNotificationDeliveryFilterKey, shouldDeliverFilteredEvent } from "@/lib/notification-delivery-filters";
import { getMongoDatabase } from "./client";
import { type ActivityEventDocument, collections, type NotificationDocument } from "./collections";
import { ensureMongoSchema } from "./migrations";

const browserActivityTypes = new Set<BrowserActivity["type"]>(["DisplayName", "Friend", "GPS", "Offline", "Online", "Status", "TrustLevel", "Unfriend"]);

function isBrowserActivityType(type: ActivityEventDocument["type"]): type is BrowserActivity["type"] {
    return browserActivityTypes.has(type as BrowserActivity["type"]);
}

function earlierCandidate(notification: NotificationDocument | null, activity: ActivityEventDocument | null) {
    if (!notification) return activity ? ({ kind: "activity", document: activity } as const) : null;
    if (!activity) return { kind: "notification", document: notification } as const;
    return notification.firstObservedAt <= activity.observedAt ? ({ kind: "notification", document: notification } as const) : ({ kind: "activity", document: activity } as const);
}

/**
 * Claims delivery candidates atomically. Filtered-out records are also marked
 * processed so changing a filter cannot replay stale events unlike VRCX's
 * event-time filtering.
 */
export async function claimBrowserNotifications(ownerId: string, deliveredAt = new Date(), limit = 10): Promise<BrowserNotificationDelivery[]> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const settingsDocument = await c.appSettings.findOne({ _id: "singleton" });
    if (settingsDocument?.activeUserId !== ownerId || settingsDocument.browserNotificationsEnabled !== true || !settingsDocument.browserNotificationsEnabledAt) return [];

    const settings = serializeAppSettings(settingsDocument);
    const filters = settings.notificationDeliveryFilters ?? defaultNotificationDeliveryFilters;
    const enabledAt = settingsDocument.browserNotificationsEnabledAt;
    const [favoriteIds, friendDocuments] = await Promise.all([listSelectedFavoriteFriendIds(ownerId), c.friendSnapshots.find({ ownerId }, { projection: { friendId: 1 } }).toArray()]);
    const favorites = new Set(favoriteIds);
    const friends = new Set(friendDocuments.map((document) => document.friendId));
    const deliveries: BrowserNotificationDelivery[] = [];
    const scanLimit = Math.max(100, limit * 10);

    for (let scanned = 0; scanned < scanLimit && deliveries.length < limit; scanned += 1) {
        const [notification, activity] = await Promise.all([
            c.notifications.findOne({ ownerId, source: { $in: ["legacy", "v2"] }, firstObservedAt: { $gte: enabledAt }, browserDeliveredAt: { $exists: false } }, { sort: { firstObservedAt: 1, _id: 1 } }),
            c.activityEvents.findOne({ ownerId, type: { $in: [...browserActivityTypes] }, observedAt: { $gte: enabledAt }, browserDeliveredAt: { $exists: false } }, { sort: { observedAt: 1, _id: 1 } }),
        ]);
        const candidate = earlierCandidate(notification, activity);
        if (!candidate) break;

        if (candidate.kind === "notification") {
            const claimed = await c.notifications.findOneAndUpdate({ _id: candidate.document._id, ownerId, browserDeliveredAt: { $exists: false } }, { $set: { browserDeliveredAt: deliveredAt, updatedAt: deliveredAt } }, { returnDocument: "after" });
            if (!claimed) continue;
            const type = claimed.notification.type;
            if (!isNotificationDeliveryFilterKey(type)) continue;
            const isFavorite = Boolean(claimed.notification.senderUserId && favorites.has(claimed.notification.senderUserId));
            // VRCX treats an incoming Invite-family notification as satisfying
            // its Friends level; only VIP performs an explicit favorite check.
            if (shouldDeliverFilteredEvent(filters[type], { isFriend: true, isFavorite })) deliveries.push(notificationDelivery(claimed.notification));
            continue;
        }

        const claimed = await c.activityEvents.findOneAndUpdate({ _id: candidate.document._id, ownerId, browserDeliveredAt: { $exists: false } }, { $set: { browserDeliveredAt: deliveredAt } }, { returnDocument: "after" });
        if (!claimed || !isBrowserActivityType(claimed.type) || !isNotificationDeliveryFilterKey(claimed.type)) continue;
        if (!shouldDeliverFilteredEvent(filters[claimed.type], { isFriend: friends.has(claimed.subjectUserId), isFavorite: favorites.has(claimed.subjectUserId) })) continue;
        deliveries.push(
            activityDelivery({
                id: claimed._id,
                type: claimed.type,
                displayName: claimed.displayName,
                ...(claimed.previous !== undefined ? { previous: claimed.previous } : {}),
                ...(claimed.current !== undefined ? { current: claimed.current } : {}),
            }),
        );
    }
    return deliveries;
}
