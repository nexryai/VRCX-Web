import { NextResponse } from "next/server";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";

export async function GET() {
    try {
        await ensureMongoSchema();
        const database = await getMongoDatabase();
        await database.command({ ping: 1 });
        const monitor = await collections(database).monitorState.findOne({ _id: "singleton" }, { projection: { status: 1, pipelineConnected: 1, updatedAt: 1 } });
        return NextResponse.json(
            {
                status: "ok",
                mongodb: "connected",
                monitor: {
                    status: monitor?.status ?? "idle",
                    pipelineConnected: monitor?.pipelineConnected ?? false,
                    updatedAt: monitor?.updatedAt?.toISOString(),
                },
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        // Do not expose connection strings, server names, or driver errors from
        // an endpoint commonly consumed by deployment health probes.
        return NextResponse.json({ status: "unavailable", mongodb: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
