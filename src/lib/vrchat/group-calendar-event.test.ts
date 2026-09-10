import { afterEach, describe, expect, it, vi } from "vitest";

import { groupCalendarEventInputSchema, groupCalendarEventUpstreamBody } from "./group-calendar-event";
import { assertGroupCalendarEventPolicy } from "./group-calendar-policy";

const uuid = "00000000-0000-0000-0000-000000000001";
const groupId = `grp_${uuid}`;
const roleId = `grol_${uuid}`;
const ownerId = `usr_${uuid}`;
const imageId = `file_${uuid}`;
const input = {
    startsAt: "2026-09-10T10:00:00.000Z",
    endsAt: "2026-09-10T12:00:00.000Z",
    title: "Meetup",
    accessType: "group" as const,
    description: "Join us",
    category: "hangout" as const,
    tags: ["social"],
    imageId: null,
    roleIds: [roleId],
    platforms: ["standalonewindows" as const],
    languages: ["eng"],
    sendCreationNotification: true,
    hostEarlyJoinMinutes: 60,
    guestEarlyJoinMinutes: 5,
    closeInstanceAfterEndMinutes: 5,
};

afterEach(() => vi.unstubAllGlobals());

describe("group calendar event boundaries", () => {
    it("accepts VRCX event fields and enforces dates, unique targeting, and recurrence", () => {
        expect(groupCalendarEventInputSchema.parse(input)).toEqual(input);
        expect(groupCalendarEventInputSchema.safeParse({ ...input, endsAt: input.startsAt }).success).toBe(false);
        expect(groupCalendarEventInputSchema.safeParse({ ...input, roleIds: [roleId, roleId] }).success).toBe(false);
        expect(groupCalendarEventInputSchema.safeParse({ ...input, occurrenceKind: "series" }).success).toBe(false);
        expect(groupCalendarEventInputSchema.safeParse({ ...input, occurrenceKind: "series", recurrence: { frequency: "weekly", interval: 1, timezone: "Asia/Tokyo", daysOfWeek: ["SA"], end: { type: "afterOccurrences", count: 4 } } }).success).toBe(true);
        expect(groupCalendarEventInputSchema.safeParse({ ...input, occurrenceKind: "series", recurrence: { frequency: "monthly", interval: 1, timezone: "Asia/Tokyo", end: { type: "afterDate", date: "2026-10-10T10:00" } } }).success).toBe(true);
    });

    it("retains the VRCX recurrence and notification payload for create and update", () => {
        const recurring = groupCalendarEventInputSchema.parse({ ...input, occurrenceKind: "series", recurrence: { frequency: "monthly", interval: 1, timezone: "UTC", end: null } });
        expect(groupCalendarEventUpstreamBody(recurring)).toMatchObject({ occurrenceKind: "series", recurrence: { frequency: "monthly" }, sendCreationNotification: true });
    });

    it("checks authoritative permissions, roles, privacy, and gallery ownership", async () => {
        const fetchMock = vi.fn(async (url: string | URL | Request) => {
            const path = new URL(String(url)).pathname;
            if (path.endsWith(`/groups/${groupId}`)) return Response.json({ id: groupId, name: "Calendar Group", privacy: "default", roles: [{ id: roleId, name: "Hosts" }], myMember: { permissions: ["group-calendar-manage"] } });
            return Response.json([{ id: imageId, ownerId, name: "event", extension: "png", mimeType: "image/png", tags: ["gallery"], versions: [] }]);
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(assertGroupCalendarEventPolicy(groupId, { ...input, imageId }, ownerId, { auth: "current" })).resolves.toMatchObject({ id: groupId });
        await expect(assertGroupCalendarEventPolicy(groupId, { ...input, roleIds: [`grol_00000000-0000-0000-0000-000000000002`] }, ownerId, { auth: "current" })).rejects.toMatchObject({ status: 400 });
    });

    it("rejects public events for private groups and members without calendar management", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ id: groupId, name: "Private", privacy: "private", roles: [{ id: roleId, name: "Hosts" }], myMember: { permissions: ["group-calendar-manage"] } })),
        );
        await expect(assertGroupCalendarEventPolicy(groupId, { ...input, accessType: "public" }, ownerId, { auth: "current" })).rejects.toMatchObject({ status: 400 });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ id: groupId, name: "No access", roles: [], myMember: { permissions: [] } })),
        );
        await expect(assertGroupCalendarEventPolicy(groupId, { ...input, roleIds: [] }, ownerId, { auth: "current" })).rejects.toMatchObject({ status: 403 });
    });
});
