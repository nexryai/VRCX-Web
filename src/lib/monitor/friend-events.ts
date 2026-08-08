import "server-only";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections, type FriendSnapshotDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { upsertCachedUser } from "@/lib/mongodb/user-repository";
import { vrchatUserSchema } from "@/lib/vrchat/types";
import { persistActivityTransitions } from "./activity-events";

const friendEventTypes = ["friend-active", "friend-add", "friend-delete", "friend-location", "friend-offline", "friend-online", "friend-update"] as const;
export type PipelineFriendEventType = (typeof friendEventTypes)[number];

export function isPipelineFriendEventType(value: string): value is PipelineFriendEventType {
    return (friendEventTypes as readonly string[]).includes(value);
}

function snapshot(document: FriendSnapshotDocument) {
    return toFriendSnapshots([document.user], document.online ? new Set([document.friendId]) : new Set())[0];
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
        const before = snapshot(previous);
        if (!before) return true;
        const [event] = diffFriendSnapshots([before], [], observedAt.toISOString());
        if (event) await persistActivityTransitions({ ownerId, events: [event], previousDocuments: [previous], observedAt, provenance: "pipeline" });
        await c.friendSnapshots.deleteOne({ _id: previous._id, updatedAt: previous.updatedAt });
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
    await persistActivityTransitions({ ownerId, events: changes, previousDocuments: previous ? [previous] : [], observedAt, provenance: "pipeline" });
    const result = previous ? await c.friendSnapshots.updateOne({ _id: document._id, updatedAt: previous.updatedAt }, { $set: document }) : await c.friendSnapshots.updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
    if (result.modifiedCount || result.upsertedCount) await upsertCachedUser(ownerId, user.data, "pipeline", observedAt);
    return true;
}
