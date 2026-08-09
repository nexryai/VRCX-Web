import { BSON, MongoClient } from "mongodb";

import { redactOperatorSecrets } from "./lib/redact-secrets.mjs";

import { spawn } from "node:child_process";
import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RESTORE_DATABASE_PREFIX = "vrcx_restore_smoke_";
const OUTPUT_TAIL_LIMIT = 12_000;

function requiredEnvironment(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

export function validateBackupDatabaseName(value) {
    if (!/^[A-Za-z0-9_-]{1,63}$/.test(value)) {
        throw new Error("MONGODB_DATABASE must contain only letters, numbers, underscores, or hyphens and be at most 63 characters for the backup smoke test.");
    }
    return value;
}

export function createRestoreDatabaseName(random = randomBytes(8).toString("hex")) {
    if (!/^[0-9a-f]{16}$/i.test(random)) throw new Error("The restore database suffix must be 16 hexadecimal characters.");
    return `${RESTORE_DATABASE_PREFIX}${random.toLowerCase()}`;
}

function comparableCollectionOptions(options = {}) {
    const comparable = {};
    for (const key of ["capped", "size", "max", "validator", "validationLevel", "validationAction", "timeseries", "expireAfterSeconds", "clusteredIndex", "changeStreamPreAndPostImages"]) {
        if (options[key] !== undefined) comparable[key] = options[key];
    }
    return comparable;
}

function comparableIndex(index) {
    const comparable = {
        name: index.name,
        key: Object.entries(index.key ?? {}),
    };
    for (const key of ["unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation", "hidden", "wildcardProjection"]) {
        if (index[key] !== undefined) comparable[key] = index[key];
    }
    return comparable;
}

function updateHash(hash, value) {
    const serialized = BSON.EJSON.stringify(value, { relaxed: false });
    hash.update(String(Buffer.byteLength(serialized)));
    hash.update(":");
    hash.update(serialized);
}

export async function fingerprintDatabase(database) {
    const metadata = (await database.listCollections({}, { nameOnly: false }).toArray()).filter((collection) => !collection.name.startsWith("system."));
    const unsupported = metadata.filter((collection) => collection.type !== "collection");
    if (unsupported.length) throw new Error(`The backup smoke test does not support non-collection namespaces: ${unsupported.map((collection) => collection.name).join(", ")}.`);

    const fingerprints = [];
    for (const collectionMetadata of metadata.sort((left, right) => left.name.localeCompare(right.name))) {
        const collection = database.collection(collectionMetadata.name);
        const hash = createHash("sha256");
        let count = 0;
        for await (const document of collection.find({}).sort({ _id: 1 })) {
            updateHash(hash, document);
            count += 1;
        }
        const indexes = (await collection.listIndexes().toArray()).map(comparableIndex).sort((left, right) => String(left.name).localeCompare(String(right.name)));
        fingerprints.push({
            name: collectionMetadata.name,
            count,
            digest: hash.digest("hex"),
            options: comparableCollectionOptions(collectionMetadata.options),
            indexes,
        });
    }
    return fingerprints;
}

export function databaseFingerprintsEqual(left, right) {
    return BSON.EJSON.stringify(left, { relaxed: false }) === BSON.EJSON.stringify(right, { relaxed: false });
}

function encryptionKey() {
    const configured = requiredEnvironment("VRCHAT_SESSION_ENCRYPTION_KEY");
    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("VRCHAT_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    return key;
}

async function verifyStoredSession(database, key) {
    const document = await database.collection("vrchat_session").findOne({ _id: "singleton" });
    if (!document) return false;
    const encrypted = document.encryptedCookies;
    if (encrypted?.algorithm !== "aes-256-gcm" || typeof encrypted.iv !== "string" || typeof encrypted.tag !== "string" || typeof encrypted.ciphertext !== "string") {
        throw new Error("The retained VRChat session has an unsupported encrypted representation.");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString("utf8");
    const cookies = JSON.parse(plaintext);
    if (!cookies || typeof cookies !== "object" || (cookies.auth !== undefined && typeof cookies.auth !== "string") || (cookies.twoFactorAuth !== undefined && typeof cookies.twoFactorAuth !== "string")) {
        throw new Error("The retained VRChat session could not be validated after decryption.");
    }
    return true;
}

function runTool(command, args, label) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let outputTail = "";
        let settled = false;
        const capture = (chunk) => {
            outputTail = `${outputTail}${chunk.toString()}`.slice(-OUTPUT_TAIL_LIMIT);
        };
        child.stdout?.on("data", capture);
        child.stderr?.on("data", capture);
        child.once("error", (error) => {
            if (settled) return;
            settled = true;
            rejectRun(new Error(`${label} could not start. Install MongoDB Database Tools or set its binary override. ${redactOperatorSecrets(error.message)}`));
        });
        child.once("close", (code, signal) => {
            if (settled) return;
            settled = true;
            if (code === 0) resolveRun();
            else rejectRun(new Error(`${label} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}.\n${redactOperatorSecrets(outputTail)}`));
        });
    });
}

async function main() {
    const uri = requiredEnvironment("MONGODB_URI");
    const databaseName = validateBackupDatabaseName(process.env.MONGODB_DATABASE?.trim() || "vrcx");
    const key = encryptionKey();
    const dumpBinary = process.env.MONGODUMP_BINARY?.trim() || "mongodump";
    const restoreBinary = process.env.MONGORESTORE_BINARY?.trim() || "mongorestore";
    const restoreDatabaseName = createRestoreDatabaseName();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "vrcx-mongodb-backup-smoke-"));
    const archivePath = join(temporaryDirectory, "vrcx.archive.gz");
    const toolsConfigPath = join(temporaryDirectory, "mongodb-tools.yml");
    const client = new MongoClient(uri, { appName: "vrcx-mongodb-backup-smoke" });
    let cleanupRestoreDatabase = false;

    try {
        // Database Tools 100.3+ accepts sensitive connection strings through
        // a mode-0600 YAML file, keeping credentials out of process listings.
        await writeFile(toolsConfigPath, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600 });
        await client.connect();
        const existingDatabases = await client.db("admin").admin().listDatabases({ nameOnly: true });
        if (existingDatabases.databases.some((database) => database.name === restoreDatabaseName)) {
            throw new Error(`The generated restore database already exists: ${restoreDatabaseName}.`);
        }
        cleanupRestoreDatabase = true;
        const source = client.db(databaseName);
        const beforeDump = await fingerprintDatabase(source);
        if (!beforeDump.length) throw new Error(`The source database ${databaseName} has no application collections to back up.`);
        const sourceSessionPresent = await verifyStoredSession(source, key);

        await runTool(dumpBinary, [`--config=${toolsConfigPath}`, `--db=${databaseName}`, `--archive=${archivePath}`, "--gzip"], "mongodump");
        const archive = await stat(archivePath);
        if (!archive.isFile() || archive.size <= 0) throw new Error("mongodump did not create a non-empty archive.");

        const afterDump = await fingerprintDatabase(source);
        if (!databaseFingerprintsEqual(beforeDump, afterDump)) {
            throw new Error("The source database changed while it was being dumped. Stop application writers and run the backup smoke test again.");
        }

        await runTool(restoreBinary, [`--config=${toolsConfigPath}`, `--archive=${archivePath}`, "--gzip", `--nsFrom=${databaseName}.*`, `--nsTo=${restoreDatabaseName}.*`], "mongorestore");
        const restored = client.db(restoreDatabaseName);
        const restoredFingerprint = await fingerprintDatabase(restored);
        if (!databaseFingerprintsEqual(afterDump, restoredFingerprint)) {
            throw new Error("The isolated restore does not match the source database documents, collection options, and indexes.");
        }
        const restoredSessionPresent = await verifyStoredSession(restored, key);
        if (sourceSessionPresent !== restoredSessionPresent) throw new Error("The restored VRChat session evidence does not match the source database.");

        const documents = restoredFingerprint.reduce((total, collection) => total + collection.count, 0);
        process.stdout.write(`MongoDB backup/restore proof passed: ${restoredFingerprint.length} collections, ${documents} documents, ${archive.size} archive bytes; encrypted session ${restoredSessionPresent ? "verified" : "not present"}.\n`);
    } finally {
        try {
            if (cleanupRestoreDatabase) await client.db(restoreDatabaseName).dropDatabase();
        } finally {
            try {
                await client.close();
            } finally {
                await rm(temporaryDirectory, { recursive: true, force: true });
            }
        }
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`${redactOperatorSecrets(error instanceof Error ? error.message : "MongoDB backup/restore smoke test failed.")}\n`);
        process.exitCode = 1;
    });
}
