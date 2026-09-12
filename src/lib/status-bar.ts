export type StatusBarVisibility = {
    servers: boolean;
    ws: boolean;
    monitor: boolean;
    sync: boolean;
    rateLimit: boolean;
    uptime: boolean;
};

export function normalizeUtcHour(value: number): number {
    return Number.isFinite(value) ? Math.max(-12, Math.min(14, Math.round(value))) : 0;
}

export function formatUtcHour(value: number): string {
    const offset = normalizeUtcHour(value);
    return `UTC${offset >= 0 ? "+" : ""}${offset}`;
}

export function formatClock(now: Date, offset: number): string {
    const shifted = new Date(now.getTime() + normalizeUtcHour(offset) * 3_600_000);
    return `${shifted.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} ${formatUtcHour(offset)}`;
}

export function formatAppUptime(elapsedSeconds: number): string {
    const safe = Math.max(0, Math.floor(elapsedSeconds));
    const hours = Math.floor(safe / 3_600)
        .toString()
        .padStart(2, "0");
    const minutes = Math.floor((safe % 3_600) / 60)
        .toString()
        .padStart(2, "0");
    const seconds = (safe % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}
