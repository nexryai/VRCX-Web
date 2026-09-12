import "server-only";

import type { VrchatCosmeticIconFrame } from "@/lib/vrchat/types";
import { getMongoDatabase } from "./client";
import { collections } from "./collections";
import { ensureMongoSchema } from "./migrations";

export const ICON_FRAME_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export async function getCosmeticIconFrameSnapshot(ownerId: string) {
    await ensureMongoSchema();
    return collections(await getMongoDatabase()).cosmeticIconFrameSnapshots.findOne({ _id: ownerId, ownerId });
}

export async function shouldRefreshCosmeticIconFrames(ownerId: string, now = new Date()): Promise<boolean> {
    const snapshot = await getCosmeticIconFrameSnapshot(ownerId);
    return !snapshot || snapshot.observedAt.getTime() <= now.getTime() - ICON_FRAME_REFRESH_INTERVAL_MS;
}

export async function replaceCosmeticIconFrameSnapshot(ownerId: string, frames: VrchatCosmeticIconFrame[], observedAt = new Date()) {
    await ensureMongoSchema();
    await collections(await getMongoDatabase()).cosmeticIconFrameSnapshots.updateOne({ _id: ownerId }, { $set: { ownerId, frames, observedAt, updatedAt: observedAt } }, { upsert: true });
}
