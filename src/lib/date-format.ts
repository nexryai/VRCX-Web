export type VrcxDateFormat = "long" | "short" | "time" | "date";
export type VrcxDateSettings = { hour12: boolean; iso: boolean };

function pad(value: number) {
    return String(value).padStart(2, "0");
}

/** Closely translates VRCX/src/coordinators/dateCoordinator.js. */
export function formatVrcxDate(value: string | Date | null | undefined, format: VrcxDateFormat, settings: VrcxDateSettings, locale?: string) {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    if (settings.iso && format === "long") {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    if (format === "long") {
        return date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: settings.hour12 ? "h12" : "h23" });
    }
    if (format === "short") {
        return date
            .toLocaleDateString(locale, { month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: settings.hour12 ? "h12" : "h23" })
            .replace(" AM", "am")
            .replace(" PM", "pm")
            .replace(",", "");
    }
    if (format === "time") {
        return date.toLocaleTimeString(locale, { hour: "numeric", minute: "numeric", hourCycle: settings.hour12 ? "h12" : "h23" });
    }
    return date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function orderedWeekdays(weekStartsOn: 0 | 1 | 6) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)];
}

export function calendarGridStart(firstOfMonth: Date, weekStartsOn: 0 | 1 | 6) {
    const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
    return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - offset);
}
