import { describe, expect, it } from "vitest";

import { formatGroupAuditLogCsv, groupAuditLogTypeName } from "./group-audit-log-transfer";

describe("group audit-log transfer", () => {
    it("matches VRCX audit type labels", () => {
        expect(groupAuditLogTypeName("group.member.ban")).toBe("Member Ban");
    });

    it("exports selected fields and neutralizes spreadsheet formulas", () => {
        const output = formatGroupAuditLogCsv(["eventType", "actorDisplayName", "data"], [{ id: "log", created_at: "2026-08-17T00:00:00Z", eventType: "group.member.ban", actorDisplayName: "=cmd", description: "Ban", data: { reason: 'quoted "value"' } }]);
        expect(output).toMatch(/^eventType,actorDisplayName,data\n/);
        expect(output).toContain('"\'=cmd"');
        expect(output).toContain('""reason""');
        expect(output).toContain('\\""value\\""');
    });
});
