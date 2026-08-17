import type { VrchatGroupAuditLog } from "@/lib/vrchat/types";

export const GROUP_AUDIT_LOG_EXPORT_FIELDS = ["created_at", "eventType", "actorDisplayName", "description", "data"] as const;
export type GroupAuditLogExportField = (typeof GROUP_AUDIT_LOG_EXPORT_FIELDS)[number];
export const GROUP_AUDIT_LOG_EXPORT_LABELS: Record<GroupAuditLogExportField, string> = {
    created_at: "Created At",
    eventType: "Type",
    actorDisplayName: "Display Name",
    description: "Description",
    data: "Data",
};

export function groupAuditLogTypeName(value: string) {
    return value
        .replace(/^group\./, "")
        .replaceAll(".", " ")
        .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function formatGroupAuditLogCsv(fields: GroupAuditLogExportField[], logs: VrchatGroupAuditLog[]) {
    if (!fields.length) return "";
    const value = (log: VrchatGroupAuditLog, field: GroupAuditLogExportField) => {
        if (field === "data") return log.data ? JSON.stringify(log.data) : "";
        return log[field] || "";
    };
    return [fields.join(","), ...logs.map((log) => fields.map((field) => csvField(value(log, field))).join(","))].join("\n");
}

function csvField(value: string) {
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
}
