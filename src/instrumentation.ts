export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    if (process.env.NODE_ENV !== "production" && process.env.VRCX_DISABLE_MONITOR === "true") return;
    const { startAlwaysOnMonitor } = await import("@/lib/monitor/service");
    startAlwaysOnMonitor();
}
