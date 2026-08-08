import { NextResponse } from "next/server";

import { z } from "zod";

import { type GameSessionCursor, listGameSessionActivities, listGameSessions } from "@/lib/game-log/session-repository";
import type { GameSessionDto } from "@/lib/game-log/types";
import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().max(1_024).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    search: z.string().trim().max(128).default(""),
});

const cursorSchema = z.object({ startedAt: z.iso.datetime(), id: z.string().length(64) });

function decodeCursor(value: string | undefined): GameSessionCursor | undefined {
    if (!value) return undefined;
    try {
        const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
        return { startedAt: new Date(parsed.startedAt), id: parsed.id };
    } catch {
        return undefined;
    }
}

function encodeCursor(cursor: GameSessionCursor | undefined): string | undefined {
    if (!cursor) return undefined;
    return Buffer.from(JSON.stringify({ startedAt: cursor.startedAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return NextResponse.json({ error: "The Game Log session query is invalid." }, { status: 400 });
    const cursor = decodeCursor(query.data.cursor);
    if (query.data.cursor && !cursor) return NextResponse.json({ error: "The Game Log session cursor is invalid." }, { status: 400 });

    const stored = await getStoredVrchatSession();
    if (!stored?.activeUserId || stored.status !== "authenticated") {
        return NextResponse.json({ error: "Sign in to view Game Log sessions." }, { status: 401 });
    }

    const result = await listGameSessions({
        ownerId: stored.activeUserId,
        limit: query.data.limit,
        ...(cursor ? { cursor } : {}),
        ...(query.data.from ? { from: new Date(query.data.from) } : {}),
        ...(query.data.to ? { to: new Date(query.data.to) } : {}),
        ...(query.data.search ? { search: query.data.search } : {}),
    });
    const activities = await listGameSessionActivities(stored.activeUserId, result.sessions);
    const sessions: GameSessionDto[] = result.sessions.map((session) => ({
        id: session._id,
        location: session.location,
        ...(session.worldId ? { worldId: session.worldId } : {}),
        ...(session.instanceId ? { instanceId: session.instanceId } : {}),
        ...(session.worldName ? { worldName: session.worldName } : {}),
        ...(session.groupId ? { groupId: session.groupId } : {}),
        ...(session.groupName ? { groupName: session.groupName } : {}),
        startedAt: session.startedAt.toISOString(),
        ...(session.endedAt ? { endedAt: session.endedAt.toISOString() } : {}),
        startPrecision: session.startPrecision,
        startSource: session.startSource,
        ...(session.endPrecision ? { endPrecision: session.endPrecision } : {}),
        ...(session.endSource ? { endSource: session.endSource } : {}),
        firstObservedAt: session.firstObservedAt.toISOString(),
        lastObservedAt: session.lastObservedAt.toISOString(),
        current: session.current,
        activities: (activities.get(session._id) || []).map((activity) => ({
            id: activity._id,
            type: activity.type,
            displayName: activity.displayName,
            occurredAt: activity.occurredAt.toISOString(),
            ...(activity.previous !== undefined ? { previous: activity.previous } : {}),
            ...(activity.current !== undefined ? { current: activity.current } : {}),
            provenance: activity.provenance,
        })),
    }));

    const response = NextResponse.json({ sessions, nextCursor: encodeCursor(result.nextCursor) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
