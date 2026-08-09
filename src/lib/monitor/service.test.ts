import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    hasLease: true,
    acquireMonitorLease: vi.fn(async () => true),
    updateMonitorHealth: vi.fn(async () => undefined),
    getStoredVrchatSession: vi.fn(async () => ({ status: "authenticated" as const, activeUserId: "usr_00000000-0000-0000-0000-000000000001", cookies: { auth: "auth-cookie" } })),
    updateStoredVrchatCookies: vi.fn(async () => true),
    reconcileRemoteState: vi.fn(async () => ({ user: { id: "usr_00000000-0000-0000-0000-000000000001", displayName: "Monitor User" }, cookies: { auth: "auth-cookie" } })),
    requestVrchat: vi.fn(async () => ({ data: { ok: true, token: "pipeline-token" }, cookies: {} })),
    advanceMonitorPipelineCursor: vi.fn(async () => true),
    prepareMonitorIdentity: vi.fn(async () => undefined),
    observeGameSession: vi.fn(async (): Promise<void> => undefined),
    resolveLocationMetadata: vi.fn(async () => ({ cookies: { auth: "auth-cookie" } })),
    runAvatarAutoCleanup: vi.fn(async () => ({ ran: false, days: null, deleted: 0 })),
    resumeStaleMutualGraphJob: vi.fn(async () => false),
    applyPipelineSelfEvent: vi.fn(async () => true),
    sockets: [] as FakeWebSocket[],
}));

class FakeWebSocket {
    static readonly OPEN = 1;
    readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    readyState = 0;
    closed = false;

    constructor(_url: string) {
        mocks.sockets.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => void) {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    emit(event: string, ...args: unknown[]) {
        if (event === "open") this.readyState = FakeWebSocket.OPEN;
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    close() {
        this.closed = true;
        for (const listener of this.listeners.get("close") ?? []) listener();
    }
}

vi.mock("ws", () => ({ default: FakeWebSocket }));
vi.mock("./lease", () => ({
    acquireMonitorLease: mocks.acquireMonitorLease,
    advanceMonitorPipelineCursor: mocks.advanceMonitorPipelineCursor,
    prepareMonitorIdentity: mocks.prepareMonitorIdentity,
    updateMonitorHealth: mocks.updateMonitorHealth,
}));
vi.mock("./reconcile", () => ({ reconcileRemoteState: mocks.reconcileRemoteState }));
vi.mock("./location-metadata", () => ({ resolveLocationMetadata: mocks.resolveLocationMetadata }));
vi.mock("./avatar-cleanup", () => ({ runAvatarAutoCleanup: mocks.runAvatarAutoCleanup }));
vi.mock("@/lib/mutual-graph-job", () => ({ resumeStaleMutualGraphJob: mocks.resumeStaleMutualGraphJob }));
vi.mock("./self-events", () => ({ applyPipelineSelfEvent: mocks.applyPipelineSelfEvent }));
vi.mock("./friend-events", () => ({ applyPipelineFriendEvent: vi.fn(), isPipelineFriendEventType: vi.fn(() => false) }));
vi.mock("@/lib/mongodb/session-repository", () => ({
    clearStoredVrchatSession: vi.fn(),
    getStoredVrchatSession: mocks.getStoredVrchatSession,
    updateStoredVrchatCookies: mocks.updateStoredVrchatCookies,
}));
vi.mock("@/lib/notifications/repository", () => ({ applyPipelineNotificationState: vi.fn(), upsertPipelineNotification: vi.fn() }));
vi.mock("@/lib/game-log/session-repository", () => ({ enrichGameSession: vi.fn(), observeGameSession: mocks.observeGameSession }));
vi.mock("@/lib/vrchat/client", () => ({
    requestVrchat: mocks.requestVrchat,
    VrchatApiError: class VrchatApiError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasLease = true;
    mocks.sockets.length = 0;
    mocks.acquireMonitorLease.mockImplementation(async () => mocks.hasLease);
    mocks.observeGameSession.mockResolvedValue(undefined);
    mocks.resolveLocationMetadata.mockResolvedValue({ cookies: { auth: "auth-cookie" } });
});

afterEach(() => vi.useRealTimers());

describe("AlwaysOnMonitor leadership lifecycle", () => {
    test("reconciles before reconnecting after leadership is reacquired without a browser", async () => {
        vi.useFakeTimers();
        const { AlwaysOnMonitor } = await import("./service");
        const monitor = new AlwaysOnMonitor();

        await monitor.start();
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(1);
        expect(mocks.runAvatarAutoCleanup).toHaveBeenCalledWith("usr_00000000-0000-0000-0000-000000000001");
        expect(mocks.resumeStaleMutualGraphJob).toHaveBeenCalledWith("usr_00000000-0000-0000-0000-000000000001", { auth: "auth-cookie" });
        expect(mocks.sockets).toHaveLength(1);

        mocks.hasLease = false;
        await vi.advanceTimersByTimeAsync(20_000);
        expect(mocks.sockets[0]?.closed).toBe(true);

        mocks.hasLease = true;
        await vi.advanceTimersByTimeAsync(20_000);
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(2);
        expect(mocks.sockets).toHaveLength(2);
        monitor.stop();
    });

    test("serializes periodic reconciliation behind successful Pipeline ingestion", async () => {
        vi.useFakeTimers();
        let releaseObservation: () => void = () => undefined;
        const observationGate = new Promise<void>((resolve) => {
            releaseObservation = resolve;
        });
        mocks.observeGameSession.mockImplementationOnce(() => observationGate);
        const { AlwaysOnMonitor } = await import("./service");
        const monitor = new AlwaysOnMonitor();

        await monitor.start();
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(1);
        const socket = mocks.sockets[0];
        expect(socket).toBeDefined();
        socket?.emit("open");
        socket?.emit(
            "message",
            JSON.stringify({
                type: "user-location",
                content: JSON.stringify({ userId: "usr_00000000-0000-0000-0000-000000000001", location: "wrld_00000000-0000-0000-0000-000000000010:12345" }),
            }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.observeGameSession).toHaveBeenCalledTimes(1);
        expect(mocks.applyPipelineSelfEvent).toHaveBeenCalledWith("usr_00000000-0000-0000-0000-000000000001", "user-location", expect.objectContaining({ location: "wrld_00000000-0000-0000-0000-000000000010:12345" }), expect.any(Date));

        await vi.advanceTimersByTimeAsync(120_000);
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(1);

        releaseObservation();
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.advanceMonitorPipelineCursor).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ ownerId: "usr_00000000-0000-0000-0000-000000000001", type: "user-location" }));
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(2);
        monitor.stop();
    });

    test("applies current-user updates through the self activity path before committing the Pipeline cursor", async () => {
        vi.useFakeTimers();
        const { AlwaysOnMonitor } = await import("./service");
        const monitor = new AlwaysOnMonitor();
        await monitor.start();
        const socket = mocks.sockets[0];
        socket?.emit("open");
        socket?.emit(
            "message",
            JSON.stringify({
                type: "user-update",
                content: JSON.stringify({ user: { id: "usr_00000000-0000-0000-0000-000000000001", displayName: "Monitor User", status: "join me", statusDescription: "Own update" } }),
            }),
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.applyPipelineSelfEvent).toHaveBeenCalledWith("usr_00000000-0000-0000-0000-000000000001", "user-update", expect.objectContaining({ user: expect.objectContaining({ statusDescription: "Own update" }) }), expect.any(Date));
        expect(mocks.advanceMonitorPipelineCursor).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: "user-update" }));
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(1);
        monitor.stop();
    });
});
