import "server-only";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import type { VrchatNotification } from "@/lib/vrchat/types";

import { createHash } from "node:crypto";

export type NotificationSource = "hidden" | "legacy" | "v2";

function documentId(ownerId: string, source: NotificationSource, notificationId: string) {
    return `${ownerId}:${source}:${notificationId}`;
}

function notificationDate(notification: VrchatNotification, fallback: Date) {
    const value = notification.createdAt ?? notification.created_at;
    if (typeof value === "number") {
        const date = new Date(value < 1_000_000_000_000 ? value * 1_000 : value);
        return Number.isNaN(date.getTime()) ? fallback : date;
    }
    if (value) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return fallback;
}

async function recordFriendRequest(ownerId: string, notification: VrchatNotification, observedAt: Date, provenance: ActivityEventDocument["provenance"]) {
    if (notification.type !== "friendRequest" || !notification.senderUserId) return;
    const document: ActivityEventDocument = {
        _id: createHash("sha256").update(`${ownerId}\u0000FriendRequest\u0000${notification.id}`).digest("hex"),
        ownerId,
        type: "FriendRequest",
        subjectUserId: notification.senderUserId,
        displayName: notification.senderUsername || notification.senderUserId,
        occurredAt: notificationDate(notification, observedAt),
        observedAt,
        provenance,
    };
    await collections(await getMongoDatabase()).activityEvents.updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
}

export async function replaceActiveNotifications(ownerId: string, source: NotificationSource, notifications: VrchatNotification[], observedAt: Date) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).notifications;
    const ids = notifications.map((notification) => notification.id);
    if (notifications.length) {
        await collection.bulkWrite(
            notifications.map((notification) => {
                const _id = documentId(ownerId, source, notification.id);
                return {
                    updateOne: {
                        filter: { _id },
                        update: {
                            $set: {
                                ownerId,
                                notificationId: notification.id,
                                source,
                                notification: { ...notification, source },
                                active: true,
                                lastObservedAt: observedAt,
                                updatedAt: observedAt,
                            },
                            $setOnInsert: { _id, firstObservedAt: observedAt },
                        },
                        upsert: true,
                    },
                };
            }),
            { ordered: false },
        );
        await Promise.all(notifications.map((notification) => recordFriendRequest(ownerId, notification, observedAt, "reconciliation")));
    }

    // Retain notification history while removing records no longer present in
    // the upstream pending set from the active UI projection.
    await collection.updateMany({ ownerId, source, active: true, ...(ids.length ? { notificationId: { $nin: ids } } : {}) }, { $set: { active: false, updatedAt: observedAt } });
}

export async function upsertPipelineNotification(ownerId: string, source: Extract<NotificationSource, "legacy" | "v2">, notification: VrchatNotification, observedAt: Date) {
    await ensureMongoSchema();
    const _id = documentId(ownerId, source, notification.id);
    await collections(await getMongoDatabase()).notifications.updateOne(
        { _id },
        {
            $set: {
                ownerId,
                notificationId: notification.id,
                source,
                notification: { ...notification, source },
                active: true,
                lastObservedAt: observedAt,
                updatedAt: observedAt,
            },
            $setOnInsert: { _id, firstObservedAt: observedAt },
        },
        { upsert: true },
    );
    await recordFriendRequest(ownerId, notification, observedAt, "pipeline");
}

export async function applyPipelineNotificationState(ownerId: string, notificationIds: string[], source: Extract<NotificationSource, "legacy" | "v2">, state: "hidden" | "seen", observedAt: Date) {
    if (!notificationIds.length) return;
    await ensureMongoSchema();
    const sources: NotificationSource[] = source === "legacy" ? ["legacy", "hidden"] : ["v2"];
    const update = state === "hidden" ? { active: false, updatedAt: observedAt } : { "notification.seen": true, seenAt: observedAt, updatedAt: observedAt };
    await collections(await getMongoDatabase()).notifications.updateMany({ ownerId, notificationId: { $in: notificationIds }, source: { $in: sources } }, { $set: update });
}

export async function updateNotificationProjection(ownerId: string, notificationId: string, source: Extract<NotificationSource, "legacy" | "v2">, action: "accept" | "hide" | "respond" | "see") {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).notifications;
    const updatedAt = new Date();
    const filter = source === "legacy" ? { ownerId, notificationId, source: { $in: ["legacy", "hidden"] as NotificationSource[] } } : { _id: documentId(ownerId, source, notificationId) };
    if (action === "see") {
        await collection.updateMany(filter, { $set: { "notification.seen": true, seenAt: updatedAt, updatedAt } });
        return;
    }
    await collection.updateMany(filter, { $set: { active: false, updatedAt } });
}

export async function listActiveNotifications(ownerId: string, source: NotificationSource, offset: number, limit = 100): Promise<VrchatNotification[]> {
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .notifications.find({ ownerId, source, active: true })
        .sort({ lastObservedAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    return documents.map((document) => (document.seenAt ? { ...document.notification, seen: true } : document.notification));
}

export async function listNotificationCenterNotifications(ownerId: string, source: Extract<NotificationSource, "legacy" | "v2">, offset: number, now = new Date(), limit = 100): Promise<VrchatNotification[]> {
    await ensureMongoSchema();
    const recentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const documents = await collections(await getMongoDatabase())
        .notifications.find({ ownerId, source, $or: [{ active: true }, { firstObservedAt: { $gte: recentCutoff } }] })
        .sort({ lastObservedAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    return documents.map((document) => (document.seenAt ? { ...document.notification, seen: true } : document.notification));
}
