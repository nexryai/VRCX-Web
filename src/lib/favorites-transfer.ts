import { VRCHAT_UUID_PATTERN_SOURCE } from "@/lib/vrchat/ids";

export type FavoriteTransferKind = "avatar" | "friend" | "world";

export const FAVORITE_TRANSFER_MAX_FILE_BYTES = 1_000_000;

export function parseFavoriteIds(kind: FavoriteTransferKind, input: string, limit = 1_000) {
    const prefix = kind === "avatar" ? "avtr" : kind === "friend" ? "usr" : "wrld";
    return Array.from(new Set(input.match(new RegExp(`${prefix}_${VRCHAT_UUID_PATTERN_SOURCE}(?![0-9a-f-])`, "gi")) || [])).slice(0, limit);
}

export function isVrcxCsvExport(kind: FavoriteTransferKind, input: string): boolean {
    const headers = input.split(/\r?\n/).map((line) => line.trim());
    if (kind === "friend") return headers.some((line) => /^(UserID,Name|UserID,DisplayName,Memo)$/i.test(line));
    if (kind === "avatar" && headers.some((line) => /^AvatarID,AvatarName$/i.test(line))) return true;
    // VRCX's World and Avatar Favorites dialogs use the selected field labels
    // as their header. ID is required for this importer to find any entries.
    const allowedFields = new Set(["id", "name", "author id", "author name", "thumbnail"]);
    return headers.some((line) => {
        const fields = line.split(",").map((field) => field.trim().toLowerCase());
        return fields.includes("id") && fields.every((field) => allowedFields.has(field));
    });
}

export function formatFavoriteCsv<Field extends string>(fields: Field[], rows: Array<Record<Field, string>>) {
    if (!fields.length) return "";
    return [fields.map(csvField).join(","), ...rows.map((row) => fields.map((field) => csvField(row[field])).join(","))].join("\r\n");
}

function csvField(value: string) {
    // Spreadsheet applications can execute formula-looking CSV cells. Prefix
    // untrusted upstream labels while preserving their visible value.
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
}
