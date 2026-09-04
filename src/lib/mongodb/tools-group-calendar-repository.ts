import "server-only";

import { type ToolsGroupCalendarPayload, toolsGroupCalendarPayloadSchema } from "@/lib/group-calendar";
import type { VrchatGroupCalendarInterestUpdate } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getToolsGroupCalendar(ownerId: string, month: string) {
    await ensureMongoSchema();
    const document = await collections(await getMongoDatabase()).toolsGroupCalendarSnapshots.findOne({ _id: `${ownerId}:${month}`, ownerId, month });
    if (!document) return null;
    return toolsGroupCalendarPayloadSchema.parse({
        month: document.month,
        events: document.events,
        followingEvents: document.followingEvents,
        featuredEvents: document.featuredEvents,
        featuredFetched: document.featuredFetched,
        groups: document.groups,
        observedAt: document.observedAt,
    });
}

export async function replaceToolsGroupCalendar(ownerId: string, payload: Omit<ToolsGroupCalendarPayload, "cached">) {
    await ensureMongoSchema();
    const validated = toolsGroupCalendarPayloadSchema.omit({ cached: true }).parse(payload);
    await collections(await getMongoDatabase()).toolsGroupCalendarSnapshots.updateOne({ _id: `${ownerId}:${validated.month}` }, { $set: { ownerId, ...validated, updatedAt: validated.observedAt } }, { upsert: true });
}

export async function updateToolsGroupCalendarEvent(ownerId: string, event: VrchatGroupCalendarInterestUpdate, updatedAt = new Date()) {
    await ensureMongoSchema();
    const collection = collections(await getMongoDatabase()).toolsGroupCalendarSnapshots;
    await collection.updateMany({ ownerId, $or: [{ "events.id": event.id }, { "featuredEvents.id": event.id }, { "followingEvents.id": event.id }] }, [
        {
            $set: {
                events: { $map: { input: "$events", as: "item", in: { $cond: [{ $eq: ["$$item.id", event.id] }, { $mergeObjects: ["$$item", { userInterest: event.userInterest }] }, "$$item"] } } },
                featuredEvents: { $map: { input: "$featuredEvents", as: "item", in: { $cond: [{ $eq: ["$$item.id", event.id] }, { $mergeObjects: ["$$item", { userInterest: event.userInterest }] }, "$$item"] } } },
                followingEvents: event.userInterest.isFollowing
                    ? {
                          $cond: [
                              { $in: [event.id, "$followingEvents.id"] },
                              { $map: { input: "$followingEvents", as: "item", in: { $cond: [{ $eq: ["$$item.id", event.id] }, { $mergeObjects: ["$$item", { userInterest: event.userInterest }] }, "$$item"] } } },
                              {
                                  $concatArrays: [
                                      "$followingEvents",
                                      {
                                          $filter: {
                                              input: { $concatArrays: ["$events", "$featuredEvents"] },
                                              as: "item",
                                              cond: { $eq: ["$$item.id", event.id] },
                                              limit: 1,
                                          },
                                      },
                                  ],
                              },
                          ],
                      }
                    : { $filter: { input: "$followingEvents", as: "item", cond: { $ne: ["$$item.id", event.id] } } },
                updatedAt,
            },
        },
    ]);
}
