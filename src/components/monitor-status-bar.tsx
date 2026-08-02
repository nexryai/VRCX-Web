"use client";

import { useEffect, useState } from "react";

type MonitorStatus = {
    status: "idle" | "starting" | "healthy" | "reconnecting" | "authentication-required" | "error";
    pipelineConnected: boolean;
    lastPipelineEventAt?: string;
    lastReconciledAt?: string;
    lastError?: string;
    rateLimit?: { remaining?: number; resetAt?: string; blockedUntil?: string };
};

function time(value?: string) {
    if (!value) return "Never";
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export function MonitorStatusBar() {
    const [status, setStatus] = useState<MonitorStatus>({ status: "idle", pipelineConnected: false });
    const [now, setNow] = useState(() => new Date());

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
        void refresh();
        const statusTimer = window.setInterval(() => void refresh(), 10_000);
        const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
        return () => {
            controller.abort();
            window.clearInterval(statusTimer);
            window.clearInterval(clockTimer);
        };
    }, []);

    const blocked = status.rateLimit?.blockedUntil && Date.parse(status.rateLimit.blockedUntil) > Date.now();
    return (
        <footer className="flex h-[22px] shrink-0 select-none items-center overflow-hidden border-t border-border bg-sidebar px-2 font-mono text-[10px]" aria-label="Server monitoring status">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]">
                <div className="flex h-[22px] shrink-0 items-center gap-1 border-r border-border px-2" title={status.lastError || `Monitor state: ${status.status}`}>
                    <span className={`size-2 rounded-full ${status.status === "healthy" ? "bg-status-online" : status.status === "error" || status.status === "authentication-required" ? "bg-destructive" : "bg-status-askme"}`} />
                    <span className="text-[11px] text-foreground">Monitor</span>
                    <span className="capitalize text-muted-foreground">{status.status.replaceAll("-", " ")}</span>
                </div>
                <div className="flex h-[22px] shrink-0 items-center gap-1 border-r border-border px-2" title={`Last Pipeline event: ${time(status.lastPipelineEventAt)}`}>
                    <span className={`size-2 rounded-full ${status.pipelineConnected ? "bg-status-online" : "bg-status-offline"}`} />
                    <span className="text-[11px] text-foreground">WebSocket</span>
                </div>
                <div className="flex h-[22px] shrink-0 items-center gap-1 border-r border-border px-2" title={`Last reconciliation: ${time(status.lastReconciledAt)}`}>
                    <i className="ri-refresh-line text-[11px]" aria-hidden="true" />
                    <span className="text-foreground">Sync {time(status.lastReconciledAt)}</span>
                </div>
                {status.rateLimit?.remaining !== undefined || blocked ? (
                    <div className="flex h-[22px] shrink-0 items-center gap-1 border-r border-border px-2" title={blocked ? `Requests paused until ${time(status.rateLimit?.blockedUntil)}` : "VRChat API requests remaining in the current upstream window"}>
                        <span className={`size-2 rounded-full ${blocked ? "bg-status-askme" : "bg-status-online"}`} />
                        <span className="text-foreground">API {blocked ? "limited" : status.rateLimit?.remaining}</span>
                    </div>
                ) : null}
            </div>
            <time className="ml-auto h-[22px] shrink-0 border-l border-border px-2 leading-[22px] text-foreground" dateTime={now.toISOString()}>
                {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now)}
            </time>
        </footer>
    );
}
