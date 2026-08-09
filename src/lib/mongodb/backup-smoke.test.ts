import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createRestoreDatabaseName, databaseFingerprintsEqual, fingerprintDatabase, validateBackupDatabaseName } from "../../../scripts/mongodb-backup-smoke.mjs";

let server: MongoMemoryServer;

beforeAll(async () => {
    server = await MongoMemoryServer.create();
});

afterAll(async () => {
    await server.stop();
});

describe("MongoDB backup/restore proof", () => {
    test("uses constrained source names and an unmistakable temporary restore namespace", () => {
        expect(validateBackupDatabaseName("vrcx-production_1")).toBe("vrcx-production_1");
        expect(() => validateBackupDatabaseName("vrcx.*")).toThrow(/letters, numbers/);
        expect(createRestoreDatabaseName("A1B2C3D4E5F60708")).toBe("vrcx_restore_smoke_a1b2c3d4e5f60708");
        expect(() => createRestoreDatabaseName("not-random")).toThrow(/hexadecimal/);
    });

    test("compares every document, collection option, and relevant index definition", async () => {
        const { MongoClient } = await import("mongodb");
        const client = new MongoClient(server.getUri());
        await client.connect();
        try {
            const source = client.db("backup_source");
            const restored = client.db("backup_restored");
            for (const database of [source, restored]) {
                await database.createCollection("activity_events");
                await database.collection("activity_events").insertMany([
                    { _id: "first", ownerId: "usr_one", occurredAt: new Date("2026-08-09T00:00:00.000Z"), payload: { status: "online" } },
                    { _id: "second", ownerId: "usr_one", occurredAt: new Date("2026-08-09T00:01:00.000Z"), payload: { bytes: Buffer.from([1, 2, 3]) } },
                ]);
                await database.collection("activity_events").createIndex({ ownerId: 1, occurredAt: -1 }, { name: "owner_occurred", partialFilterExpression: { ownerId: { $type: "string" } } });
                await database.createCollection("empty_projection");
                await database.collection("empty_projection").createIndex({ ownerId: 1 }, { name: "owner_unique", unique: true });
            }

            const sourceFingerprint = await fingerprintDatabase(source);
            expect(databaseFingerprintsEqual(sourceFingerprint, await fingerprintDatabase(restored))).toBe(true);
            expect(sourceFingerprint).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: "activity_events", count: 2, indexes: expect.arrayContaining([expect.objectContaining({ name: "owner_occurred" })]) }),
                    expect.objectContaining({ name: "empty_projection", count: 0, indexes: expect.arrayContaining([expect.objectContaining({ name: "owner_unique", unique: true })]) }),
                ]),
            );

            await restored.collection("activity_events").updateOne({ _id: "second" }, { $set: { "payload.bytes": Buffer.from([9]) } });
            expect(databaseFingerprintsEqual(sourceFingerprint, await fingerprintDatabase(restored))).toBe(false);
        } finally {
            await client.close();
        }
    });
});
