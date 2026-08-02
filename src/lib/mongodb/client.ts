import "server-only";

import { type Db, MongoClient } from "mongodb";

import { getMongoConfig } from "./config";

type MongoGlobal = typeof globalThis & {
    __vrcxMongoClientPromise?: Promise<MongoClient>;
};

const mongoGlobal = globalThis as MongoGlobal;

function connectMongoClient() {
    const { uri } = getMongoConfig();
    const client = new MongoClient(uri, {
        appName: "vrcx-nextjs",
        maxPoolSize: 20,
        minPoolSize: 0,
        retryReads: true,
        retryWrites: true,
    });
    return client.connect();
}

export async function getMongoClient(): Promise<MongoClient> {
    // Cache on globalThis so Next.js development module reloads do not create
    // an unbounded number of connection pools.
    mongoGlobal.__vrcxMongoClientPromise ??= connectMongoClient();
    try {
        return await mongoGlobal.__vrcxMongoClientPromise;
    } catch (error) {
        mongoGlobal.__vrcxMongoClientPromise = undefined;
        throw error;
    }
}

export async function getMongoDatabase(): Promise<Db> {
    const client = await getMongoClient();
    return client.db(getMongoConfig().database);
}
