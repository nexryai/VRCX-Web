import "server-only";

import { z } from "zod";

import { buildHotWorldFriends, buildHotWorlds, type HotWorldPeriod, type HotWorldVisit, hotWorldPeriodBounds } from "../hot-worlds";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

const visitDocumentSchema = z.object({ _id: z.string(), subjectUserId: z.string(), displayName: z.string(), current: z.string(), occurredAt: z.date() });

async function listVisitEvents(ownerId: string, periodStart: Date): Promise<HotWorldVisit[]> {
    const documents = z.array(visitDocumentSchema).parse(
        await collections(await getMongoDatabase())
            .activityEvents.find({ ownerId, subjectUserId: { $ne: ownerId }, type: "GPS", occurredAt: { $gte: periodStart }, current: { $type: "string" } })
            .project({ _id: 1, subjectUserId: 1, displayName: 1, current: 1, occurredAt: 1 })
            .toArray(),
    );
    return documents.map((document) => ({ id: document._id, userId: document.subjectUserId, displayName: document.displayName, location: document.current, occurredAt: document.occurredAt }));
}

export async function listHotWorlds(ownerId: string, days: HotWorldPeriod, now = new Date()) {
    await ensureMongoSchema();
    const { periodStart, recentStart } = hotWorldPeriodBounds(days, now);
    const visits = await listVisitEvents(ownerId, periodStart);
    const worldIds = [...new Set(visits.map((visit) => visit.location?.split(":", 1)[0]).filter((value): value is string => Boolean(value)))];
    const worlds = worldIds.length
        ? await collections(await getMongoDatabase())
              .worlds.find({ ownerId, worldId: { $in: worldIds } })
              .toArray()
        : [];
    return buildHotWorlds(visits, periodStart, recentStart, new Map(worlds.map((document) => [document.worldId, document.world.name])));
}

export async function listHotWorldFriends(ownerId: string, worldId: string, days: HotWorldPeriod, now = new Date()) {
    await ensureMongoSchema();
    const { periodStart } = hotWorldPeriodBounds(days, now);
    return buildHotWorldFriends(await listVisitEvents(ownerId, periodStart), worldId, periodStart);
}
