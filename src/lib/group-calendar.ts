import type { VrchatGroupCalendarEvent } from "./vrchat/types";

function oneEventPerSeries(events: VrchatGroupCalendarEvent[]) {
    const series = new Set<string>();
    return events.filter((event) => {
        if (!event.seriesId) return true;
        if (series.has(event.seriesId)) return false;
        series.add(event.seriesId);
        return true;
    });
}

export function partitionGroupCalendarEvents(events: VrchatGroupCalendarEvent[], now = Date.now()) {
    const sorted = events.toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
        past: oneEventPerSeries(sorted.filter((event) => Date.parse(event.endsAt) < now)),
        upcoming: oneEventPerSeries(sorted.filter((event) => Date.parse(event.endsAt) >= now)),
    };
}
