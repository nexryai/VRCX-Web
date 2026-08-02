import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    hasLease: true,
    acquireMonitorLease: vi.fn(async () => true),
    updateMonitorHealth: vi.fn(async () => undefined),
    getStoredVrchatSession: vi.fn(async () => ({ status: "authenticated" as const, activeUserId: "usr_00000000-0000-0000-0000-000000000001", cookies: { auth: "auth-cookie" } })),
    updateStoredVrchatCookies: vi.fn(async () => true),
    reconcileRemoteState: vi.fn(async () => ({ user: { id: "usr_00000000-0000-0000-0000-000000000001", displayName: "Monitor User" }, cookies: { auth: "auth-cookie" } })),
    requestVrchat: vi.fn(async () => ({ data: { ok: true, token: "pipeline-token" }, cookies: {} })),
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

    close() {
        this.closed = true;
        for (const listener of this.listeners.get("close") ?? []) listener();
    }
}

vi.mock("ws", () => ({ default: FakeWebSocket }));
vi.mock("./lease", () => ({
    acquireMonitorLease: mocks.acquireMonitorLease,
    updateMonitorHealth: mocks.updateMonitorHealth,
}));
vi.mock("./reconcile", () => ({ reconcileRemoteState: mocks.reconcileRemoteState }));
vi.mock("./location-metadata", () => ({ resolveLocationMetadata: vi.fn() }));
vi.mock("./friend-events", () => ({ applyPipelineFriendEvent: vi.fn(), isPipelineFriendEventType: vi.fn(() => false) }));
vi.mock("@/lib/mongodb/session-repository", () => ({
    clearStoredVrchatSession: vi.fn(),
    getStoredVrchatSession: mocks.getStoredVrchatSession,
    updateStoredVrchatCookies: mocks.updateStoredVrchatCookies,
}));
vi.mock("@/lib/notifications/repository", () => ({ applyPipelineNotificationState: vi.fn(), upsertPipelineNotification: vi.fn() }));
vi.mock("@/lib/game-log/session-repository", () => ({ enrichGameSession: vi.fn(), observeGameSession: vi.fn() }));
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
});

afterEach(() => vi.useRealTimers());

describe("AlwaysOnMonitor leadership lifecycle", () => {
    test("reconciles before reconnecting after leadership is reacquired without a browser", async () => {
        vi.useFakeTimers();
        const { AlwaysOnMonitor } = await import("./service");
        const monitor = new AlwaysOnMonitor();

        await monitor.start();
        expect(mocks.reconcileRemoteState).toHaveBeenCalledTimes(1);
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
});
