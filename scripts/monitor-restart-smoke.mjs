import { MongoClient } from "mongodb";

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const POLL_MS = 500;
const OUTPUT_TAIL_LIMIT = 12_000;

/**
 * @typedef {object} RestartProofExpectation
 * @property {string} ownerId
 * @property {Date} reconciledAfter
 * @property {string | undefined} [differentLeaderId]
 * @property {number | undefined} [minimumPipelineSequence]
 * @property {Date | undefined} [leaseValidAt]
 */

/**
 * Checks the durable evidence required after a monitor process starts.
 * @param {Record<string, unknown> | null} state
 * @param {RestartProofExpectation} expected
 */
export function monitorStateMatchesRestartProof(state, expected) {
    if (!state || state.ownerId !== expected.ownerId || typeof state.leaderId !== "string" || !state.leaderId) return false;
    if (expected.differentLeaderId && state.leaderId === expected.differentLeaderId) return false;
    if (state.status !== "healthy" || state.pipelineConnected !== true) return false;
    if (!(state.leaseExpiresAt instanceof Date) || state.leaseExpiresAt <= (expected.leaseValidAt ?? new Date())) return false;
    if (!(state.lastReconciledAt instanceof Date) || state.lastReconciledAt < expected.reconciledAfter) return false;
    const sequence = typeof state.pipelineSequence === "number" ? state.pipelineSequence : -1;
    return sequence >= (expected.minimumPipelineSequence ?? 0);
}

function requiredEnvironment(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
    }
    return value;
}

function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function redactSecrets(value) {
    let redacted = value;
    for (const secret of [process.env.MONGODB_URI, process.env.VRCHAT_SESSION_ENCRYPTION_KEY]) {
        if (secret) redacted = redacted.split(secret).join("[redacted]");
    }
    return redacted;
}

function startProductionServer(workspace, port) {
    const nextCli = resolve(workspace, "node_modules/next/dist/bin/next");
    const child = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
        cwd: workspace,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let outputTail = "";
    /** @type {Error | undefined} */
    let launchError;
    const capture = (chunk) => {
        outputTail = `${outputTail}${chunk.toString()}`.slice(-OUTPUT_TAIL_LIMIT);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", (error) => {
        launchError = error;
    });
    return { child, error: () => launchError, output: () => outputTail };
}

async function stopOwnedServer(server, signal) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) return;
    server.child.kill(signal);
    const exited = await Promise.race([new Promise((resolveExit) => server.child.once("exit", resolveExit)).then(() => true), delay(10_000).then(() => false)]);
    if (!exited && server.child.exitCode === null && server.child.signalCode === null) {
        server.child.kill("SIGKILL");
        await new Promise((resolveExit) => server.child.once("exit", resolveExit));
    }
}

async function waitForLeaseAvailability(monitorState, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await monitorState.findOne({ _id: "singleton" }, { projection: { leaderId: 1, leaseExpiresAt: 1 } });
        if (!(state?.leaseExpiresAt instanceof Date) || state.leaseExpiresAt <= new Date()) return state?.leaderId;
        await delay(POLL_MS);
    }
    throw new Error("The existing monitor lease did not expire. Stop the other application process before running this smoke test.");
}

async function waitForMonitorProof(monitorState, server, expected, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (server.error()) throw new Error(`The production server could not start: ${redactSecrets(server.error().message)}`);
        if (server.child.exitCode !== null || server.child.signalCode !== null) {
            throw new Error(`The production server exited before monitor recovery.\n${redactSecrets(server.output())}`);
        }
        const state = await monitorState.findOne({ _id: "singleton" });
        if (monitorStateMatchesRestartProof(state, expected)) return state;
        await delay(POLL_MS);
    }
    throw new Error(`Timed out waiting for monitor recovery.\n${redactSecrets(server.output())}`);
}

async function main() {
    const workspace = process.cwd();
    await access(resolve(workspace, ".next/BUILD_ID"));
    const uri = requiredEnvironment("MONGODB_URI");
    requiredEnvironment("VRCHAT_SESSION_ENCRYPTION_KEY");
    const databaseName = process.env.MONGODB_DATABASE?.trim() || "vrcx";
    const port = boundedInteger("VRCX_RESTART_SMOKE_PORT", 3100, 1024, 65_535);
    const timeoutMs = boundedInteger("VRCX_RESTART_SMOKE_TIMEOUT_MS", 180_000, 30_000, 600_000);
    const client = new MongoClient(uri, { appName: "vrcx-monitor-restart-smoke" });
    /** @type {ReturnType<typeof startProductionServer> | undefined} */
    let firstServer;
    /** @type {ReturnType<typeof startProductionServer> | undefined} */
    let secondServer;

    try {
        await client.connect();
        const database = client.db(databaseName);
        const session = await database.collection("vrchat_session").findOne({ _id: "singleton", status: "authenticated" });
        const settings = await database.collection("app_settings").findOne({ _id: "singleton" }, { projection: { activeUserId: 1 } });
        if (!session?.encryptedCookies || !settings?.activeUserId || session.activeUserId !== settings.activeUserId) {
            throw new Error("An encrypted authenticated VRChat session for the active identity is required.");
        }

        const monitorState = database.collection("monitor_state");
        const priorLeaderId = await waitForLeaseAvailability(monitorState, timeoutMs);
        const firstStartedAt = new Date();
        firstServer = startProductionServer(workspace, port);
        const firstProof = await waitForMonitorProof(monitorState, firstServer, { ownerId: settings.activeUserId, reconciledAfter: firstStartedAt, differentLeaderId: priorLeaderId }, timeoutMs);

        const firstLeaderId = firstProof.leaderId;
        const firstSequence = typeof firstProof.pipelineSequence === "number" ? firstProof.pipelineSequence : 0;
        await stopOwnedServer(firstServer, "SIGKILL");
        firstServer = undefined;

        const restartStartedAt = new Date();
        secondServer = startProductionServer(workspace, port);
        const secondProof = await waitForMonitorProof(
            monitorState,
            secondServer,
            {
                ownerId: settings.activeUserId,
                reconciledAfter: restartStartedAt,
                differentLeaderId: firstLeaderId,
                minimumPipelineSequence: firstSequence,
            },
            timeoutMs,
        );

        process.stdout.write(`Monitor restart proof passed: ${firstLeaderId} -> ${secondProof.leaderId}; Pipeline sequence ${firstSequence} -> ${secondProof.pipelineSequence}.\n`);
    } finally {
        if (firstServer) await stopOwnedServer(firstServer, "SIGTERM");
        if (secondServer) await stopOwnedServer(secondServer, "SIGTERM");
        await client.close();
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`${redactSecrets(error instanceof Error ? error.message : "Monitor restart smoke test failed.")}\n`);
        process.exitCode = 1;
    });
}
