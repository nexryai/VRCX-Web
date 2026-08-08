import { describe, expect, test } from "vitest";

import { monitorStateMatchesRestartProof } from "../../../scripts/monitor-restart-smoke.mjs";

describe("monitor restart proof", () => {
    const expected = {
        ownerId: "usr_00000000-0000-0000-0000-000000000001",
        reconciledAfter: new Date("2026-08-08T14:00:00.000Z"),
        differentLeaderId: "first-leader",
        minimumPipelineSequence: 7,
        leaseValidAt: new Date("2026-08-08T14:00:00.000Z"),
    };

    test("requires a new healthy leader with a completed baseline and retained cursor", () => {
        expect(
            monitorStateMatchesRestartProof(
                {
                    ownerId: expected.ownerId,
                    leaderId: "second-leader",
                    status: "healthy",
                    pipelineConnected: true,
                    pipelineSequence: 7,
                    leaseExpiresAt: new Date("2026-08-08T15:00:00.000Z"),
                    lastReconciledAt: new Date("2026-08-08T14:00:01.000Z"),
                },
                expected,
            ),
        ).toBe(true);
    });

    test.each([
        ["old leader", { leaderId: "first-leader" }],
        ["wrong identity", { ownerId: "usr_other" }],
        ["no Pipeline", { pipelineConnected: false }],
        ["expired lease", { leaseExpiresAt: new Date("2026-08-08T13:00:00.000Z") }],
        ["unfinished baseline", { lastReconciledAt: new Date("2026-08-08T13:59:59.000Z") }],
        ["cursor regression", { pipelineSequence: 6 }],
    ])("rejects %s evidence", (_label, change) => {
        const state = {
            ownerId: expected.ownerId,
            leaderId: "second-leader",
            status: "healthy",
            pipelineConnected: true,
            pipelineSequence: 7,
            leaseExpiresAt: new Date("2026-08-08T15:00:00.000Z"),
            lastReconciledAt: new Date("2026-08-08T14:00:01.000Z"),
            ...change,
        };
        expect(monitorStateMatchesRestartProof(state, expected)).toBe(false);
    });
});
