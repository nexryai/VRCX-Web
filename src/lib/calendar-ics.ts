const MAX_CALENDAR_BYTES = 1024 * 1024;

export function validateCalendarIcs(content: unknown) {
    if (typeof content !== "string" || new TextEncoder().encode(content).byteLength > MAX_CALENDAR_BYTES || content.includes("\0")) throw new Error("The calendar file was not valid.");
    const envelope = content.replace(/^\uFEFF/, "").trim();
    if (!envelope.startsWith("BEGIN:VCALENDAR") || !envelope.endsWith("END:VCALENDAR")) throw new Error("The calendar file was not valid.");
    return content;
}

export function calendarDownloadHeaders(eventId: string) {
    return {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${eventId}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
    };
}
