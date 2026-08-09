import "server-only";

import { parseObservableLocation } from "../game-log/location";
import { buildRemoteUserPreviousInstances, type PreviousInstanceRow, type PreviousInstancesVariant } from "../previous-instances";
import { getMongoDatabase } from "./client";
import type { GameSessionDocument } from "./collections";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

function sessionDuration(session: GameSessionDocument) {
    return Math.max(0, (session.endedAt || session.lastObservedAt).getTime() - session.startedAt.getTime());
}

function sessionRow(session: GameSessionDocument): PreviousInstanceRow {
    const parsed = parseObservableLocation(session.location);
    return {
        id: session._id,
        location: session.location,
        worldId: session.worldId || "",
        instanceId: session.instanceId || "",
        ...(session.groupId ? { groupId: session.groupId } : {}),
        ...(parsed?.creatorId ? { creatorId: parsed.creatorId } : {}),
        ...(session.worldName ? { worldName: session.worldName } : {}),
        ...(session.groupName ? { groupName: session.groupName } : {}),
        startedAt: session.startedAt.toISOString(),
        firstObservedAt: session.firstObservedAt.toISOString(),
        lastObservedAt: (session.endedAt || session.lastObservedAt).toISOString(),
        durationMs: sessionDuration(session),
        current: session.current,
        observationCount: 1,
        source: "active-account-session",
        startPrecision: session.startPrecision,
        ...(session.endPrecision ? { endPrecision: session.endPrecision } : {}),
    };
}

function aggregateSessions(sessions: GameSessionDocument[]) {
    const byLocation = new Map<string, PreviousInstanceRow>();
    for (const session of sessions.toSorted((left, right) => right.startedAt.getTime() - left.startedAt.getTime())) {
        const row = sessionRow(session);
        const existing = byLocation.get(row.location);
        if (!existing) {
            byLocation.set(row.location, row);
            continue;
        }
        existing.durationMs += row.durationMs;
        existing.observationCount += 1;
        existing.current ||= row.current;
        if (row.firstObservedAt < existing.firstObservedAt) existing.firstObservedAt = row.firstObservedAt;
        if (row.lastObservedAt > existing.lastObservedAt) existing.lastObservedAt = row.lastObservedAt;
        existing.startPrecision = existing.startPrecision === "upstream" && row.startPrecision === "upstream" ? "upstream" : "observed";
        if (existing.endPrecision || row.endPrecision) existing.endPrecision = existing.endPrecision === "upstream" && row.endPrecision === "upstream" ? "upstream" : "observed";
        existing.worldName ||= row.worldName;
        existing.groupName ||= row.groupName;
    }
    return [...byLocation.values()];
}

async function addCachedNames(ownerId: string, rows: PreviousInstanceRow[]) {
    const c = collections(await getMongoDatabase());
    const worldIds = [...new Set(rows.map((row) => row.worldId).filter(Boolean))];
    const groupIds = [...new Set(rows.map((row) => row.groupId).filter((value): value is string => Boolean(value)))];
    const creatorIds = [...new Set(rows.map((row) => row.creatorId).filter((value): value is string => Boolean(value)))];
    const [worlds, groups, users] = await Promise.all([
        worldIds.length ? c.worlds.find({ ownerId, worldId: { $in: worldIds } }).toArray() : [],
        groupIds.length ? c.groups.find({ ownerId, groupId: { $in: groupIds } }).toArray() : [],
        creatorIds.length ? c.users.find({ ownerId, userId: { $in: creatorIds } }).toArray() : [],
    ]);
    const worldNames = new Map(worlds.map((document) => [document.worldId, document.world.name]));
    const groupNames = new Map(groups.map((document) => [document.groupId, document.group.name]));
    const creatorNames = new Map(users.map((document) => [document.userId, document.user.displayName]));
    return rows.map((row) => ({
        ...row,
        worldName: row.worldName || worldNames.get(row.worldId),
        ...(row.groupId ? { groupName: row.groupName || groupNames.get(row.groupId) } : {}),
        ...(row.creatorId ? { creatorName: row.creatorName || creatorNames.get(row.creatorId) } : {}),
    }));
}

export async function listPreviousInstances(ownerId: string, variant: PreviousInstancesVariant, entityId: string): Promise<PreviousInstanceRow[]> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    let rows: PreviousInstanceRow[];

    if (variant === "user" && entityId !== ownerId) {
        const [events, snapshot] = await Promise.all([
            c.activityEvents
                .find({ ownerId, subjectUserId: entityId, type: { $in: ["GPS", "Offline", "Online"] } })
                .sort({ occurredAt: 1, _id: 1 })
                .toArray(),
            c.friendSnapshots.findOne({ ownerId, friendId: entityId }),
        ]);
        rows = buildRemoteUserPreviousInstances(
            events.map((event) => ({
                id: event._id,
                type: event.type as "GPS" | "Offline" | "Online",
                ...(event.previous !== undefined ? { previous: event.previous } : {}),
                ...(event.current !== undefined ? { current: event.current } : {}),
                ...(event.previousSnapshotObservedAt ? { previousSnapshotObservedAt: event.previousSnapshotObservedAt } : {}),
                occurredAt: event.occurredAt,
            })),
            { location: snapshot?.user.location || snapshot?.user.travelingToLocation, observedAt: snapshot?.updatedAt },
        );
    } else {
        const filter = variant === "user" ? { ownerId } : variant === "world" ? { ownerId, worldId: entityId } : { ownerId, groupId: entityId };
        const sessions = await c.gameSessions.find(filter).sort({ startedAt: -1, _id: -1 }).toArray();
        rows = variant === "user" ? sessions.map(sessionRow) : aggregateSessions(sessions);
    }

    return addCachedNames(ownerId, rows);
}
