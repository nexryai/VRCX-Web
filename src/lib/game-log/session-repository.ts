import "server-only";

import { type Filter, MongoServerError } from "mongodb";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { type ActivityEventDocument, collections, type GameSessionDocument } from "@/lib/mongodb/collections";
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

const sessionActivityTypes = ["Avatar", "Bio", "GPS", "Offline", "Online", "Status"] as const;
export type GameSessionActivityDocument = ActivityEventDocument & { type: (typeof sessionActivityTypes)[number] };

function sessionId(ownerId: string, location: string, startedAt: Date): string {
    return createHash("sha256").update(`${ownerId}\u0000${location}\u0000${startedAt.toISOString()}`).digest("hex");
}

export async function observeGameSession(observation: SessionObservation): Promise<void> {
    await ensureMongoSchema();
    const c = collections(await getMongoDatabase());
    const parsed = parseObservableLocation(observation.location);
    const open = await c.gameSessions.findOne({ ownerId: observation.ownerId, current: true });
    if (open && observation.observedAt < open.lastObservedAt) return;

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
            { _id: open._id, current: true, lastObservedAt: { $lte: observation.observedAt } },
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
    try {
        await c.gameSessions.updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
    } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
            // A newer concurrent observation won the unique-current-session
            // race. Never reopen an older location after that transition.
            const current = await c.gameSessions.findOne({ ownerId: observation.ownerId, current: true });
            if (current && current.lastObservedAt >= observation.observedAt) return;
        }
        throw error;
    }
}

export async function enrichGameSession(ownerId: string, location: string | undefined, metadata: { worldName?: string; groupName?: string }): Promise<void> {
    const parsed = parseObservableLocation(location);
    if (!parsed || (!metadata.worldName && !metadata.groupName)) return;
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).gameSessions.updateOne({ ownerId, location: parsed.location }, { $set: { ...(metadata.worldName ? { worldName: metadata.worldName } : {}), ...(metadata.groupName ? { groupName: metadata.groupName } : {}), updatedAt: new Date() } }, { sort: { startedAt: -1 } });
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

/** Associates remotely observed self activity with the location session that contained its observed boundary. */
export async function listGameSessionActivities(ownerId: string, sessions: GameSessionDocument[]): Promise<Map<string, GameSessionActivityDocument[]>> {
    const bySession = new Map(sessions.map((session) => [session._id, [] as GameSessionActivityDocument[]]));
    if (!sessions.length) return bySession;
    await ensureMongoSchema();
    const tolerance = 1_000;
    const earliest = new Date(Math.min(...sessions.map((session) => session.startedAt.getTime())) - tolerance);
    const latest = new Date(
        Math.max(
            ...sessions.map((session) => {
                if (session.endedAt) return session.endedAt.getTime() + tolerance;
                return Math.max(session.lastObservedAt.getTime(), Date.now());
            }),
        ),
    );
    const c = collections(await getMongoDatabase());
    const [events, associationSessions] = await Promise.all([
        c.activityEvents
            .find({ ownerId, subjectUserId: ownerId, type: { $in: [...sessionActivityTypes] }, occurredAt: { $gte: earliest, $lte: latest } })
            .sort({ occurredAt: 1, _id: 1 })
            .toArray() as Promise<GameSessionActivityDocument[]>,
        c.gameSessions
            .find({
                ownerId,
                startedAt: { $lte: latest },
                $or: [{ endedAt: { $gte: earliest } }, { current: true }],
            })
            .toArray(),
    ]);

    for (const event of events) {
        const occurredAt = event.occurredAt.getTime();
        const candidates = associationSessions.filter((session) => occurredAt >= session.startedAt.getTime() - tolerance && occurredAt <= (session.endedAt?.getTime() ?? Number.POSITIVE_INFINITY) + tolerance);
        if (!candidates.length) continue;
        let target: GameSessionDocument | undefined;
        if (event.type === "GPS") {
            target = event.current ? candidates.find((session) => session.location === event.current) : undefined;
            if (!target) continue;
        }
        if (!target && event.type === "Offline") {
            target = candidates.filter((session) => session.endedAt).sort((left, right) => (right.endedAt?.getTime() ?? 0) - (left.endedAt?.getTime() ?? 0))[0];
            if (!target) continue;
        }
        target ??= candidates.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0];
        if (target) bySession.get(target._id)?.push(event);
    }
    for (const eventsForSession of bySession.values()) eventsForSession.reverse();
    return bySession;
}
