export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { startAlwaysOnMonitor } = await import("@/lib/monitor/service");
    startAlwaysOnMonitor();
}
