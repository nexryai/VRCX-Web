import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { listSidebarGroupInstances } from "@/lib/mongodb/group-dialog-repository";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { requireActiveUserId } from "@/lib/mongodb/single-user";

const querySchema = z.object({ scope: z.enum(["memberships", "sidebar"]).default("memberships") });

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The groups query is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    if (query.data.scope === "sidebar") {
        const response = NextResponse.json({ groups: await listSidebarGroupInstances(ownerId) });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    }
    await ensureMongoSchema();
    const documents = await collections(await getMongoDatabase())
        .groups.find({ ownerId, membershipActive: true })
        .sort({ "group.name": 1 })
        .toArray();
    const response = NextResponse.json({ groups: documents.map((document) => document.group) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
