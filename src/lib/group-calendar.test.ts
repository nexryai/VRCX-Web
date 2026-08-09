import { describe, expect, it } from "vitest";

import { partitionGroupCalendarEvents } from "./group-calendar";
import { type VrchatGroupCalendarEvent, vrchatGroupCalendarInterestUpdateSchema } from "./vrchat/types";

function event(id: string, startsAt: string, endsAt: string, seriesId: string | null = null): VrchatGroupCalendarEvent {
    return {
        id,
        ownerId: "grp_00000000-0000-0000-0000-000000000001",
        title: id,
        description: "",
        startsAt,
        endsAt,
        seriesId,
        accessType: "group",
        category: "hangout",
        closeInstanceAfterEndMinutes: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
        deletedAt: null,
        durationInMs: 3_600_000,
        featured: false,
        guestEarlyJoinMinutes: 0,
        hostEarlyJoinMinutes: 0,
        imageId: null,
        interestedUserCount: 0,
        isDraft: false,
        languages: [],
        occurrenceKind: seriesId ? "occurrence" : "single",
        platforms: [],
        recurrence: null,
        roleIds: null,
        tags: [],
        type: "event",
        updatedAt: "2026-08-01T00:00:00.000Z",
        usesInstanceOverflow: false,
    };
}

describe("VRCX group calendar partition", () => {
    it("sorts past and upcoming by start and keeps one occurrence per series in each partition", () => {
        const events = [
            event("future-late", "2026-08-12T10:00:00.000Z", "2026-08-12T11:00:00.000Z", "series-a"),
            event("past-single", "2026-08-08T10:00:00.000Z", "2026-08-08T11:00:00.000Z"),
            event("future-first", "2026-08-10T10:00:00.000Z", "2026-08-10T11:00:00.000Z", "series-a"),
            event("past-first", "2026-08-07T10:00:00.000Z", "2026-08-07T11:00:00.000Z", "series-a"),
            event("past-late", "2026-08-09T10:00:00.000Z", "2026-08-09T11:00:00.000Z", "series-a"),
        ];

        const result = partitionGroupCalendarEvents(events, Date.parse("2026-08-09T12:00:00.000Z"));
        expect(result.past.map(({ id }) => id)).toEqual(["past-first", "past-single"]);
        expect(result.upcoming.map(({ id }) => id)).toEqual(["future-first"]);
    });

    it("treats an event ending exactly now as upcoming like VRCX", () => {
        const now = "2026-08-09T12:00:00.000Z";
        expect(partitionGroupCalendarEvents([event("now", "2026-08-09T11:00:00.000Z", now)], Date.parse(now)).upcoming).toHaveLength(1);
    });

    it("accepts the partial interest object returned by the follow endpoint", () => {
        expect(vrchatGroupCalendarInterestUpdateSchema.parse({ id: "evt_one", userInterest: { isFollowing: true } })).toEqual({ id: "evt_one", userInterest: { isFollowing: true } });
        expect(vrchatGroupCalendarInterestUpdateSchema.safeParse({ id: "evt_one", userInterest: {} }).success).toBe(false);
    });
});
