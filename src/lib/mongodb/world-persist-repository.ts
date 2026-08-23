import "server-only";

import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export async function getWorldPersistSnapshot(ownerId: string, worldId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).worldPersistSnapshots.findOne({ _id: `${ownerId}:${worldId}` });
}

export async function setWorldPersistSnapshot(ownerId: string, worldId: string, hasPersistData: boolean, observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).worldPersistSnapshots.updateOne({ _id: `${ownerId}:${worldId}` }, { $set: { ownerId, worldId, hasPersistData, observedAt, updatedAt: observedAt } }, { upsert: true });
}
