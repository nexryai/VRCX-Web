import "server-only";

import type { Filter } from "mongodb";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections, type GameSessionDocument } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { parseObservableLocation, unobservableReason } from "./location";

import { createHash } from "node:crypto";

export type SessionObservation = {
    ownerId: string;
    location?: string;
    worldName?: string;
    groupName?: string;
    observedAt: Date;
    provenance: "pipeline" | "reconciliation";
};

export type GameSessionCursor = {
    startedAt: Date;
    id: string;
};

function sessionId(ownerId: string, location: string, startedAt: Date): string {
    return createHash("sha256").update(`${ownerId}\u0000${location}\u0000${startedAt.toISOString()}`).digest("hex");
}

export async function observeGameSession(observation: SessionObservation): Promise<void> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const parsed = parseObservableLocation(observation.location);
    const open = await c.gameSessions.findOne({ ownerId: observation.ownerId, current: true });

    if (!parsed) {
        if (!open) return;
        await c.gameSessions.updateOne(
            { _id: open._id, current: true },
            {
                $set: {
                    current: false,
                    endedAt: observation.observedAt,
                    endPrecision: "observed",
                    endSource: observation.provenance,
                    closeReason: unobservableReason(observation.location),
                    lastObservedAt: observation.observedAt,
                    updatedAt: observation.observedAt,
                },
            },
        );
        return;
    }

    if (open?.location === parsed.location) {
        await c.gameSessions.updateOne(
            { _id: open._id },
            {
                $set: {
                    lastObservedAt: observation.observedAt,
                    updatedAt: observation.observedAt,
                    ...(observation.worldName ? { worldName: observation.worldName } : {}),
                    ...(observation.groupName ? { groupName: observation.groupName } : {}),
                },
            },
        );
        return;
    }

    if (open) {
        await c.gameSessions.updateOne(
            { _id: open._id, current: true },
            {
                $set: {
                    current: false,
                    endedAt: observation.observedAt,
                    endPrecision: "observed",
                    endSource: observation.provenance,
                    closeReason: "location-change",
                    lastObservedAt: observation.observedAt,
                    updatedAt: observation.observedAt,
                },
            },
        );
    }

    const document: GameSessionDocument = {
        _id: sessionId(observation.ownerId, parsed.location, observation.observedAt),
        ownerId: observation.ownerId,
        location: parsed.location,
        worldId: parsed.worldId,
        instanceId: parsed.instanceId,
        ...(parsed.groupId ? { groupId: parsed.groupId } : {}),
        ...(observation.worldName ? { worldName: observation.worldName } : {}),
        ...(observation.groupName ? { groupName: observation.groupName } : {}),
        startedAt: observation.observedAt,
        // Pipeline messages used here have no authoritative occurrence time;
        // both sources therefore establish an observed lower bound.
        startPrecision: "observed",
        startSource: observation.provenance,
        firstObservedAt: observation.observedAt,
        lastObservedAt: observation.observedAt,
        current: true,
        updatedAt: observation.observedAt,
    };
    await c.gameSessions.updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
}

export async function listGameSessions(options: { ownerId: string; limit: number; cursor?: GameSessionCursor; from?: Date; to?: Date; search?: string }): Promise<{ sessions: GameSessionDocument[]; nextCursor?: GameSessionCursor }> {
    await ensureMongoSchema();
    const filter: Filter<GameSessionDocument> = { ownerId: options.ownerId };

    if (options.cursor) {
        filter.$or = [{ startedAt: { $lt: options.cursor.startedAt } }, { startedAt: options.cursor.startedAt, _id: { $lt: options.cursor.id } }];
    }
    if (options.from || options.to) {
        filter.startedAt = {
            ...(options.from ? { $gte: options.from } : {}),
            ...(options.to ? { $lte: options.to } : {}),
        };
    }
    if (options.search) {
        const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$and = [
            {
                $or: [{ location: { $regex: escaped, $options: "i" } }, { worldName: { $regex: escaped, $options: "i" } }, { groupName: { $regex: escaped, $options: "i" } }],
            },
        ];
    }

    const rows = await collections(await getMongoDatabase())
        .gameSessions.find(filter)
        .sort({ startedAt: -1, _id: -1 })
        .limit(options.limit + 1)
        .toArray();
    const hasMore = rows.length > options.limit;
    const sessions = hasMore ? rows.slice(0, options.limit) : rows;
    const last = sessions.at(-1);
    return {
        sessions,
        ...(hasMore && last ? { nextCursor: { startedAt: last.startedAt, id: last._id } } : {}),
    };
}
