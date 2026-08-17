import { formatFavoriteCsv } from "@/lib/favorites-transfer";
import { VRCHAT_UUID_PATTERN_SOURCE } from "@/lib/vrchat/ids";
import type { VrchatGroupMember } from "@/lib/vrchat/types";

export const GROUP_BAN_EXPORT_FIELDS = ["userId", "displayName", "roles", "managerNotes", "joinedAt", "bannedAt"] as const;

export type GroupBanExportField = (typeof GROUP_BAN_EXPORT_FIELDS)[number];

export const GROUP_BAN_EXPORT_LABELS: Record<GroupBanExportField, string> = {
    userId: "User ID",
    displayName: "Display Name",
    roles: "Roles",
    managerNotes: "Manager Notes",
    joinedAt: "Joined At",
    bannedAt: "Banned At",
};

export function extractGroupBanUserIds(input: string, limit = 5_000) {
    return Array.from(new Set(input.match(new RegExp(`usr_${VRCHAT_UUID_PATTERN_SOURCE}(?![0-9a-f-])`, "gi")) || [])).slice(0, limit);
}

export function formatGroupBanCsv(fields: GroupBanExportField[], bans: VrchatGroupMember[], roleNames: Map<string, string>) {
    return formatFavoriteCsv(
        fields,
        bans.map((ban) => ({
            userId: ban.userId,
            displayName: ban.user?.displayName || "",
            roles: ban.roleIds.map((roleId) => roleNames.get(roleId) || roleId).join(", "),
            managerNotes: ban.managerNotes || "",
            joinedAt: ban.joinedAt || "",
            bannedAt: ban.bannedAt || "",
        })),
    );
}
