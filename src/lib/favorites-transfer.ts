export type FavoriteTransferKind = "avatar" | "friend" | "world";

export function parseFavoriteIds(kind: FavoriteTransferKind, input: string, limit = 1_000) {
    const prefix = kind === "avatar" ? "avtr" : kind === "friend" ? "usr" : "wrld";
    return Array.from(new Set(input.match(new RegExp(`${prefix}_[0-9a-f-]{36}`, "gi")) || [])).slice(0, limit);
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
