import "server-only";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections, type FriendSnapshotDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { upsertCachedUser } from "@/lib/mongodb/user-repository";
import { vrchatUserSchema } from "@/lib/vrchat/types";

import { createHash } from "node:crypto";

const friendEventTypes = ["friend-active", "friend-add", "friend-delete", "friend-location", "friend-offline", "friend-online", "friend-update"] as const;
export type PipelineFriendEventType = (typeof friendEventTypes)[number];

export function isPipelineFriendEventType(value: string): value is PipelineFriendEventType {
    return (friendEventTypes as readonly string[]).includes(value);
}

function snapshot(document: FriendSnapshotDocument) {
    return toFriendSnapshots([document.user], document.online ? new Set([document.friendId]) : new Set())[0];
}

function eventId(ownerId: string, event: { type: string; userId: string; previous?: string; current?: string }, previousVersion: Date) {
    return createHash("sha256")
        .update(`${ownerId}\u0000${event.type}\u0000${event.userId}\u0000${previousVersion.toISOString()}\u0000${event.previous ?? ""}\u0000${event.current ?? ""}`)
        .digest("hex");
}

export async function applyPipelineFriendEvent(ownerId: string, type: PipelineFriendEventType, content: Record<string, unknown>, observedAt: Date): Promise<boolean> {
    await ensureMongoSchema();
    const embeddedUser = typeof content.user === "object" && content.user !== null ? (content.user as Record<string, unknown>) : {};
    const userId = typeof content.userId === "string" ? content.userId : typeof embeddedUser.id === "string" ? embeddedUser.id : undefined;
    if (!userId) return false;

    const c = collections(await getMongoDatabase());
    const previous = await c.friendSnapshots.findOne({ _id: `${ownerId}:${userId}` });
    if (previous && previous.updatedAt > observedAt) return true;
    if (type === "friend-delete") {
        if (!previous) return true;
        await c.friendSnapshots.deleteOne({ _id: previous._id });
        const before = snapshot(previous);
        if (!before) return true;
        const [event] = diffFriendSnapshots([before], [], observedAt.toISOString());
        if (event) {
            const document: ActivityEventDocument = {
                _id: eventId(ownerId, event, previous.updatedAt),
                ownerId,
                type: event.type,
                subjectUserId: event.userId,
                displayName: event.displayName,
                occurredAt: observedAt,
                observedAt,
                provenance: "pipeline",
            };
            await c.activityEvents.updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
        }
        return true;
    }

    const merged: Record<string, unknown> = { ...(previous?.user ?? {}), ...embeddedUser, id: userId };
    for (const key of ["location", "platform", "travelingToLocation", "worldId"] as const) {
        if (content[key] !== undefined) merged[key] = content[key];
    }
    if (type === "friend-online" || type === "friend-location") merged.state = "online";
    if (type === "friend-active") Object.assign(merged, { state: "active", location: "offline", travelingToLocation: "offline" });
    if (type === "friend-offline") Object.assign(merged, { state: "offline", location: "offline", travelingToLocation: "offline" });

    const user = vrchatUserSchema.safeParse(merged);
    if (!user.success) return false;
    const online = user.data.state === "online" || (user.data.state !== "active" && user.data.location !== "offline");
    const document: FriendSnapshotDocument = {
        _id: `${ownerId}:${userId}`,
        ownerId,
        friendId: userId,
        online,
        user: user.data,
        observedAt,
        updatedAt: observedAt,
    };

    const before = previous ? snapshot(previous) : undefined;
    const after = toFriendSnapshots([user.data], online ? new Set([userId]) : new Set())[0];
    const changes = after ? diffFriendSnapshots(before ? [before] : [], [after], observedAt.toISOString()) : [];
    await c.friendSnapshots.updateOne({ _id: document._id }, { $set: document }, { upsert: true });
    await upsertCachedUser(ownerId, user.data, "pipeline", observedAt);
    if (changes.length) {
        const previousVersion = previous?.updatedAt ?? observedAt;
        await c.activityEvents.bulkWrite(
            changes.map((event) => {
                const activity: ActivityEventDocument = {
                    _id: eventId(ownerId, event, previousVersion),
                    ownerId,
                    type: event.type,
                    subjectUserId: event.userId,
                    displayName: event.displayName,
                    ...(event.previous !== undefined ? { previous: event.previous } : {}),
                    ...(event.current !== undefined ? { current: event.current } : {}),
                    occurredAt: observedAt,
                    observedAt,
                    provenance: "pipeline",
                };
                return { updateOne: { filter: { _id: activity._id }, update: { $setOnInsert: activity }, upsert: true } };
            }),
            { ordered: false },
        );
    }
    return true;
}
