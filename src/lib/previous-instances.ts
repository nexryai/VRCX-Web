import { z } from "zod";

import type { ActivityType } from "./activity-log";
import { parseObservableLocation } from "./game-log/location";

export type PreviousInstancesVariant = "group" | "user" | "world";

export const previousInstanceRowSchema = z.object({
    id: z.string().min(1),
    location: z.string().min(1),
    worldId: z.string(),
    instanceId: z.string(),
    groupId: z.string().optional(),
    creatorId: z.string().optional(),
    creatorName: z.string().optional(),
    worldName: z.string().optional(),
    groupName: z.string().optional(),
    startedAt: z.iso.datetime(),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    durationMs: z.number().finite().nonnegative(),
    current: z.boolean(),
    observationCount: z.number().int().positive(),
    source: z.enum(["active-account-session", "remote-user-observation"]),
    startPrecision: z.enum(["observed", "upstream"]),
    endPrecision: z.enum(["observed", "upstream"]).optional(),
});

export const previousInstancesResponseSchema = z.object({ rows: z.array(previousInstanceRowSchema) });
export type PreviousInstanceRow = z.infer<typeof previousInstanceRowSchema>;

export type LocationActivity = {
    id: string;
    type: Extract<ActivityType, "GPS" | "Offline" | "Online">;
    previous?: string;
    current?: string;
    previousSnapshotObservedAt?: Date;
    occurredAt: Date;
};

type CurrentLocation = {
    location?: string;
    observedAt?: Date;
};

/**
 * Builds truthfully bounded friend-location visits from remote observations.
 * A new location or an unobservable state closes the previous lower-bound
 * interval; no local-client join/leave precision is inferred.
 */
export function buildRemoteUserPreviousInstances(events: LocationActivity[], currentLocation: CurrentLocation = {}): PreviousInstanceRow[] {
    const rows: PreviousInstanceRow[] = [];
    let open: PreviousInstanceRow | undefined;

    const closeOpen = (boundary: Date) => {
        if (!open) return;
        const end = boundary < new Date(open.startedAt) ? new Date(open.startedAt) : boundary;
        open.lastObservedAt = end.toISOString();
        open.durationMs = Math.max(0, end.getTime() - new Date(open.startedAt).getTime());
        open.endPrecision = "observed";
        rows.push(open);
        open = undefined;
    };

    for (const event of events.toSorted((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id))) {
        const parsed = event.type === "Offline" ? null : parseObservableLocation(event.current);
        const previous = parseObservableLocation(event.previous);
        if (!open && previous && previous.location !== parsed?.location) {
            const previousObservedAt = event.previousSnapshotObservedAt && event.previousSnapshotObservedAt <= event.occurredAt ? event.previousSnapshotObservedAt : event.occurredAt;
            open = {
                id: `${event.id}:previous`,
                location: previous.location,
                worldId: previous.worldId || "",
                instanceId: previous.instanceId || "",
                ...(previous.groupId ? { groupId: previous.groupId } : {}),
                ...(previous.creatorId ? { creatorId: previous.creatorId } : {}),
                startedAt: previousObservedAt.toISOString(),
                firstObservedAt: previousObservedAt.toISOString(),
                lastObservedAt: previousObservedAt.toISOString(),
                durationMs: 0,
                current: false,
                observationCount: 1,
                source: "remote-user-observation",
                startPrecision: "observed",
            };
        }
        if (!parsed) {
            closeOpen(event.occurredAt);
            continue;
        }
        if (open?.location === parsed.location) {
            open.lastObservedAt = event.occurredAt.toISOString();
            open.observationCount += 1;
            continue;
        }
        closeOpen(event.occurredAt);
        open = {
            id: event.id,
            location: parsed.location,
            worldId: parsed.worldId || "",
            instanceId: parsed.instanceId || "",
            ...(parsed.groupId ? { groupId: parsed.groupId } : {}),
            ...(parsed.creatorId ? { creatorId: parsed.creatorId } : {}),
            startedAt: event.occurredAt.toISOString(),
            firstObservedAt: event.occurredAt.toISOString(),
            lastObservedAt: event.occurredAt.toISOString(),
            durationMs: 0,
            current: false,
            observationCount: 1,
            source: "remote-user-observation",
            startPrecision: "observed",
        };
    }

    if (open) {
        const current = parseObservableLocation(currentLocation.location);
        if (current?.location === open.location) {
            const observedAt = currentLocation.observedAt && currentLocation.observedAt >= new Date(open.startedAt) ? currentLocation.observedAt : new Date(open.lastObservedAt);
            open.lastObservedAt = observedAt.toISOString();
            open.durationMs = Math.max(0, observedAt.getTime() - new Date(open.startedAt).getTime());
            open.current = true;
            rows.push(open);
        } else {
            closeOpen(currentLocation.observedAt || new Date(open.lastObservedAt));
        }
    }

    return rows.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id));
}
