"use client";

import { useEffect, useRef, useState } from "react";

import { type AppSettingsPayload, defaultStatusBarClocks, defaultStatusBarVisibility } from "@/lib/app-settings";
import { formatAppUptime, formatClock, formatUtcHour, type StatusBarVisibility } from "@/lib/status-bar";

type MonitorStatus = {
    status: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error";
    pipelineConnected: boolean;
    lastPipelineEventAt?: string;
    lastReconciledAt?: string;
    monitorStartedAt?: string;
    lastError?: string;
    avatarCleanup?: { lastRunAt?: string; deleted: number; error?: string };
    rateLimit?: { remaining?: number; resetAt?: string; blockedUntil?: string };
    vrchatService?: {
        indicator: "none" | "minor" | "major" | "critical" | "maintenance" | "unknown";
        description?: string;
        affectedComponents: string[];
        updatedAt?: string;
        checkedAt?: string;
        error?: string;
    };
};

type MenuPoint = { x: number; y: number };

function time(value?: string) {
    if (!value) return "Never";
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function statusDot(status: MonitorStatus["status"]) {
    if (status === "healthy") return "bg-status-online";
    if (status === "error" || status === "authentication-required") return "bg-destructive";
    return "bg-status-askme";
}

const itemClass = "flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap border-r border-border px-2";
const clockSlots = [
    { id: "clock-one", index: 0 },
    { id: "clock-two", index: 1 },
    { id: "clock-three", index: 2 },
] as const;

export function MonitorStatusBar() {
    const [status, setStatus] = useState<MonitorStatus>({ status: "idle", pipelineConnected: false });
    const [now, setNow] = useState<Date | null>(null);
    const [visibility, setVisibility] = useState<StatusBarVisibility>(defaultStatusBarVisibility);
    const [clockCount, setClockCount] = useState(2);
    const [clocks, setClocks] = useState<[number, number, number]>(() => defaultStatusBarClocks());
    const [contextMenu, setContextMenu] = useState<MenuPoint | null>(null);
    const [clockMenu, setClockMenu] = useState<{ index: number; right: number } | null>(null);
    const [serversHover, setServersHover] = useState(false);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const clockMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function refresh() {
            try {
                const response = await fetch("/api/monitor/status", { cache: "no-store", signal: controller.signal });
                if (response.ok) setStatus((await response.json()) as MonitorStatus);
            } catch {
                if (!controller.signal.aborted) setStatus((current) => ({ ...current, status: "error", pipelineConnected: false, lastError: "Monitor status is unavailable." }));
            }
        }
        async function loadSettings() {
            try {
                const response = await fetch("/api/settings", { cache: "no-store", signal: controller.signal });
                if (!response.ok) return;
                const settings = (await response.json()) as AppSettingsPayload;
                if (settings.statusBarVisibility) setVisibility(settings.statusBarVisibility);
                if (settings.statusBarClockCount !== undefined) setClockCount(settings.statusBarClockCount);
                if (settings.statusBarClocks) setClocks(settings.statusBarClocks);
            } catch {
                // The status bar remains usable with VRCX-derived defaults.
            }
        }
        void refresh();
        void loadSettings();
        setNow(new Date());
        const statusTimer = window.setInterval(() => void refresh(), 10_000);
        const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
        return () => {
            controller.abort();
            window.clearInterval(statusTimer);
            window.clearInterval(clockTimer);
        };
    }, []);

    useEffect(() => {
        function closeMenus(event: PointerEvent) {
            const target = event.target as Node;
            if (!contextMenuRef.current?.contains(target)) setContextMenu(null);
            if (!clockMenuRef.current?.contains(target)) setClockMenu(null);
        }
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setContextMenu(null);
                setClockMenu(null);
            }
        }
        document.addEventListener("pointerdown", closeMenus);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeMenus);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    function saveSettings(patch: Partial<AppSettingsPayload>) {
        void fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    }

    function toggleVisibility(key: keyof StatusBarVisibility) {
        const next = { ...visibility, [key]: !visibility[key] };
        setVisibility(next);
        saveSettings({ statusBarVisibility: next });
    }

    function updateClock(index: number, offset: number) {
        const next = [...clocks] as [number, number, number];
        next[index] = offset;
        setClocks(next);
        saveSettings({ statusBarClocks: next });
    }

    const blocked = Boolean(status.rateLimit?.blockedUntil && Date.parse(status.rateLimit.blockedUntil) > Date.now());
    const service = status.vrchatService;
    const serviceIssue = Boolean(service && (service.indicator !== "none" || service.error));
    const serviceMajor = service?.indicator === "major" || service?.indicator === "critical";
    const uptime = now && status.monitorStartedAt ? formatAppUptime((now.getTime() - Date.parse(status.monitorStartedAt)) / 1_000) : "--:--:--";

    return (
        <>
            <footer
                className="flex h-[22px] shrink-0 select-none items-center overflow-hidden border-t border-border bg-sidebar px-2 font-mono text-[10px]"
                aria-label="Server monitoring status"
                tabIndex={0}
                onContextMenu={(event) => {
                    event.preventDefault();
                    setClockMenu(null);
                    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 196), y: Math.max(4, event.clientY - 320) });
                }}
                onKeyDown={(event) => {
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                        event.preventDefault();
                        setContextMenu({ x: 8, y: window.innerHeight - 342 });
                    }
                }}
            >
                <div className="flex min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] [&>*:first-child]:pl-0.5">
                    {visibility.servers ? (
                        <a
                            href="https://status.vrchat.com"
                            target="_blank"
                            rel="noreferrer"
                            className={`${itemClass} cursor-pointer hover:bg-accent`}
                            title={!serviceIssue ? "VRChat servers are operational" : undefined}
                            onMouseEnter={() => setServersHover(true)}
                            onMouseLeave={() => setServersHover(false)}
                            onFocus={() => setServersHover(true)}
                            onBlur={() => setServersHover(false)}
                        >
                            <span className={`size-2 shrink-0 rounded-full ${serviceIssue ? (serviceMajor ? "bg-destructive" : "bg-status-askme") : "bg-status-online"}`} />
                            <span className="text-[11px] text-foreground">Servers</span>
                        </a>
                    ) : null}
                    {visibility.monitor ? (
                        <div className={itemClass} title={status.lastError || `Monitor state: ${status.status}`}>
                            <span className={`size-2 rounded-full ${statusDot(status.status)}`} />
                            <span className="text-[11px] text-foreground">Monitor</span>
                            <span className="capitalize text-muted-foreground">{status.status.replaceAll("-", " ")}</span>
                        </div>
                    ) : null}
                    {visibility.ws ? (
                        <div className={itemClass} title={`Last Pipeline event: ${time(status.lastPipelineEventAt)}`}>
                            <span className={`size-2 rounded-full ${status.pipelineConnected ? "bg-status-online" : "bg-status-offline"}`} />
                            <span className="text-[11px] text-foreground">WebSocket</span>
                        </div>
                    ) : null}
                    {visibility.sync ? (
                        <div className={itemClass} title={`Last reconciliation: ${time(status.lastReconciledAt)}`}>
                            <i className="ri-refresh-line text-[11px]" aria-hidden="true" />
                            <span className="text-foreground">Sync {time(status.lastReconciledAt)}</span>
                        </div>
                    ) : null}
                    {visibility.rateLimit && (status.rateLimit?.remaining !== undefined || blocked) ? (
                        <div className={itemClass} title={blocked ? `Requests paused until ${time(status.rateLimit?.blockedUntil)}` : "VRChat API requests remaining in the current upstream window"}>
                            <span className={`size-2 rounded-full ${blocked ? "bg-status-askme" : "bg-status-online"}`} />
                            <span className="text-foreground">API {blocked ? "limited" : status.rateLimit?.remaining}</span>
                        </div>
                    ) : null}
                    {status.avatarCleanup?.error ? (
                        <div className={`${itemClass} text-destructive`} title={status.avatarCleanup.error}>
                            <span className="size-2 rounded-full bg-destructive" />
                            <span>Cleanup error</span>
                        </div>
                    ) : null}
                </div>
                <div className="ml-auto flex shrink-0 items-center [&>*:last-child]:border-r-0 [&>*:last-child]:pr-0.5">
                    {now
                        ? clockSlots.slice(0, clockCount).map(({ id, index }) => (
                              <button
                                  type="button"
                                  key={id}
                                  className={`${itemClass} cursor-pointer hover:bg-accent`}
                                  onClick={(event) => {
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      setContextMenu(null);
                                      setClockMenu((current) => (current?.index === index ? null : { index, right: Math.max(4, window.innerWidth - rect.right) }));
                                  }}
                              >
                                  <time dateTime={now.toISOString()} className="text-foreground">
                                      {formatClock(now, clocks[index])}
                                  </time>
                              </button>
                          ))
                        : null}
                    {visibility.uptime ? (
                        <div className={itemClass} title="Server monitor uptime">
                            <span className="text-foreground">Uptime</span>
                            <span className="text-foreground">{uptime}</span>
                        </div>
                    ) : null}
                </div>
            </footer>

            {serversHover && serviceIssue ? (
                <div className="fixed bottom-7 left-3 z-[110] w-[280px] rounded-md border border-border bg-popover px-3 py-2.5 text-xs shadow-lg">
                    <div className="mb-1.5 flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${serviceMajor ? "bg-destructive" : "bg-status-askme"}`} />
                        <span className="font-semibold text-foreground">VRChat Server Issues</span>
                    </div>
                    <p className="m-0 text-[11px] leading-[1.4] text-muted-foreground">{[service?.description, service?.affectedComponents.join(", "), service?.error].filter(Boolean).join(": ")}</p>
                </div>
            ) : null}

            {clockMenu ? (
                <div ref={clockMenuRef} className="fixed bottom-7 z-[110] w-[280px] rounded-md border border-border bg-popover p-3 text-xs shadow-lg" style={{ right: clockMenu.right }}>
                    <label htmlFor={`status-clock-${clockMenu.index}`} className="mb-2 block font-medium">
                        Timezone
                    </label>
                    <select id={`status-clock-${clockMenu.index}`} value={clocks[clockMenu.index]} onChange={(event) => updateClock(clockMenu.index, Number(event.target.value))} className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground">
                        {Array.from({ length: 27 }, (_, index) => index - 12).map((offset) => (
                            <option key={offset} value={offset}>
                                {formatUtcHour(offset)}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {contextMenu ? (
                <div ref={contextMenuRef} role="menu" aria-label="Status bar visibility" className="fixed z-[120] w-48 rounded-md border border-border bg-popover p-1 text-xs shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    {(
                        [
                            ["servers", "Servers"],
                            ["monitor", "Monitor"],
                            ["ws", "WebSocket"],
                            ["sync", "Sync"],
                            ["rateLimit", "API Rate Limit"],
                            ["uptime", "Uptime"],
                        ] as Array<[keyof StatusBarVisibility, string]>
                    ).map(([key, label]) => (
                        <button type="button" role="menuitemcheckbox" aria-label={label} aria-checked={visibility[key]} key={key} onClick={() => toggleVisibility(key)} className="flex h-7 w-full items-center gap-2 rounded px-2 text-left hover:bg-accent">
                            <span className="w-3 text-center">{visibility[key] ? "✓" : ""}</span>
                            {label}
                        </button>
                    ))}
                    <div className="my-1 border-t border-border" />
                    <div className="px-2 pb-1 pt-0.5 text-muted-foreground">Clocks</div>
                    {[0, 1, 2, 3].map((count) => (
                        <button
                            type="button"
                            role="menuitemradio"
                            aria-label={count === 0 ? "None" : `${count} Clock${count === 1 ? "" : "s"}`}
                            aria-checked={clockCount === count}
                            key={count}
                            onClick={() => {
                                setClockCount(count);
                                saveSettings({ statusBarClockCount: count });
                            }}
                            className="flex h-7 w-full items-center gap-2 rounded px-2 text-left hover:bg-accent"
                        >
                            <span className="w-3 text-center">{clockCount === count ? "✓" : ""}</span>
                            {count === 0 ? "None" : `${count} Clock${count === 1 ? "" : "s"}`}
                        </button>
                    ))}
                </div>
            ) : null}
        </>
    );
}
