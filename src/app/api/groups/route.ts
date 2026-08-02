import { NextResponse } from "next/server";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { requireActiveUserId } from "@/lib/mongodb/single-user";

export async function GET() {
    const ownerId = await requireActiveUserId();
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .groups.find({ ownerId, membershipActive: true })
        .sort({ "group.name": 1 })
        .toArray();
    const response = NextResponse.json({ groups: documents.map((document) => document.group) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
