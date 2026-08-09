import "server-only";

import type { FriendActivity } from "@/lib/activity-log";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections, type FriendSnapshotDocument, type SelfSnapshotDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";

import { createHash } from "node:crypto";

type PersistActivityTransitionsOptions = {
    ownerId: string;
    events: FriendActivity[];
    previousDocuments: Array<FriendSnapshotDocument | SelfSnapshotDocument>;
    observedAt: Date;
    provenance: ActivityEventDocument["provenance"];
};

function snapshotUserId(document: FriendSnapshotDocument | SelfSnapshotDocument) {
    return "friendId" in document ? document.friendId : document.userId;
}

function transitionId(ownerId: string, event: FriendActivity, anchor: string) {
    return createHash("sha256")
        .update(`${ownerId}\u0000${event.type}\u0000${event.userId}\u0000${anchor}\u0000${event.previous ?? ""}\u0000${event.current ?? ""}`)
        .digest("hex");
}

/**
 * Writes normalized history before its current-state projection is advanced.
 * The transition anchor is stable across Pipeline and reconciliation retries,
 * so a crash between these two phases can only repeat the same upsert.
 */
export async function persistActivityTransitions({ ownerId, events, previousDocuments, observedAt, provenance }: PersistActivityTransitionsOptions) {
    if (!events.length) return;
    await ensureMongoSchema();
    const activityEvents = collections(await getMongoDatabase()).activityEvents;
    const previousByUser = new Map(previousDocuments.map((document) => [snapshotUserId(document), document]));
    const relationshipStarts = [...new Set(events.filter((event) => event.type === "Friend" && !previousByUser.has(event.userId)).map((event) => event.userId))];
    const relationshipAnchors = new Map<string, string>();
    if (relationshipStarts.length) {
        const priorUnfriends = await activityEvents
            .find({ ownerId, type: "Unfriend", subjectUserId: { $in: relationshipStarts } })
            .sort({ occurredAt: -1, _id: -1 })
            .toArray();
        for (const event of priorUnfriends) {
            if (!relationshipAnchors.has(event.subjectUserId)) relationshipAnchors.set(event.subjectUserId, event._id);
        }
    }

    await activityEvents.bulkWrite(
        events.map((event) => {
            const previous = previousByUser.get(event.userId);
            const anchor = previous?.updatedAt.toISOString() ?? relationshipAnchors.get(event.userId) ?? "initial-relationship";
            const occurredAt = new Date(event.createdAt);
            const document: ActivityEventDocument = {
                _id: transitionId(ownerId, event, anchor),
                ownerId,
                type: event.type,
                subjectUserId: event.userId,
                displayName: event.displayName,
                ...(event.previous !== undefined ? { previous: event.previous } : {}),
                ...(event.current !== undefined ? { current: event.current } : {}),
                ...(previous ? { previousSnapshotObservedAt: previous.updatedAt } : {}),
                occurredAt: Number.isNaN(occurredAt.getTime()) ? observedAt : occurredAt,
                observedAt,
                provenance,
            };
            return { updateOne: { filter: { _id: document._id }, update: { $setOnInsert: document }, upsert: true } };
        }),
        { ordered: false },
    );
}
