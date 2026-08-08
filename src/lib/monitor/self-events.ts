import "server-only";

import { diffFriendSnapshots, toFriendSnapshots } from "@/lib/activity-log";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections, type SelfSnapshotDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { getCachedUser, upsertCachedUser } from "@/lib/mongodb/user-repository";
import { type VrchatUser, vrchatUserSchema } from "@/lib/vrchat/types";
import { persistActivityTransitions } from "./activity-events";

type SelfEventProvenance = "pipeline" | "reconciliation";

function isOnline(user: VrchatUser) {
    if (user.state === "online") return true;
    if (user.state === "active" || user.state === "offline") return false;
    const location = user.location || user.travelingToLocation;
    return Boolean(location && location !== "offline");
}

function snapshot(document: SelfSnapshotDocument) {
    return toFriendSnapshots([document.user], document.online ? new Set([document.userId]) : new Set())[0];
}

/**
 * Advances the active identity's remote-observation baseline only after its
 * normalized activity history is durable. The first observation establishes
 * a baseline and never fabricates a relationship or presence transition.
 */
export async function applySelfSnapshot(ownerId: string, user: VrchatUser, observedAt: Date, provenance: SelfEventProvenance): Promise<boolean> {
    await ensureMongoSchema();
    if (user.id !== ownerId) return false;
    const c = collections(await getMongoDatabase());
    const previous = await c.selfSnapshots.findOne({ _id: ownerId });
    if (previous && previous.updatedAt > observedAt) return true;

    const online = isOnline(user);
    const document: SelfSnapshotDocument = {
        _id: ownerId,
        ownerId,
        userId: ownerId,
        online,
        user,
        observedAt,
        updatedAt: observedAt,
    };
    const before = previous ? snapshot(previous) : undefined;
    const after = toFriendSnapshots([user], online ? new Set([ownerId]) : new Set())[0];
    const changes = before && after ? diffFriendSnapshots([before], [after], observedAt.toISOString(), false) : [];
    await persistActivityTransitions({ ownerId, events: changes, previousDocuments: previous ? [previous] : [], observedAt, provenance });

    const result = previous ? await c.selfSnapshots.updateOne({ _id: ownerId, updatedAt: previous.updatedAt }, { $set: document }) : await c.selfSnapshots.updateOne({ _id: ownerId }, { $setOnInsert: document }, { upsert: true });
    if (result.modifiedCount || result.upsertedCount || previous?.updatedAt.getTime() === observedAt.getTime()) {
        await upsertCachedUser(ownerId, user, provenance === "pipeline" ? "pipeline" : "auth", observedAt);
    }
    return true;
}

export async function applyPipelineSelfEvent(ownerId: string, type: "user-location" | "user-update", content: Record<string, unknown>, observedAt: Date): Promise<boolean> {
    await ensureMongoSchema();
    if (typeof content.userId === "string" && content.userId !== ownerId) return false;
    const c = collections(await getMongoDatabase());
    const prior = await c.selfSnapshots.findOne({ _id: ownerId });
    const cached = prior?.user ?? (await getCachedUser(ownerId, ownerId));
    const embeddedUser = type === "user-update" && typeof content.user === "object" && content.user !== null ? (content.user as Record<string, unknown>) : {};
    if (typeof embeddedUser.id === "string" && embeddedUser.id !== ownerId) return false;
    const merged: Record<string, unknown> = { ...(cached ?? {}), ...embeddedUser, id: ownerId };
    if (type === "user-location") {
        if (typeof content.location === "string") merged.location = content.location;
        if (typeof content.travelingToLocation === "string") merged.travelingToLocation = content.travelingToLocation;
        merged.state = content.location === "offline" ? "offline" : "online";
    }
    const parsed = vrchatUserSchema.safeParse(merged);
    if (!parsed.success) return false;
    return applySelfSnapshot(ownerId, parsed.data, observedAt, "pipeline");
}
