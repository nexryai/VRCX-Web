import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { purgeAvatarFeedData } from "@/lib/monitor/avatar-cleanup";
import { isMutationOriginAllowed } from "@/lib/request-security";

const requestSchema = z.object({ days: z.union([z.literal(180), z.literal(365), z.literal(730), z.literal("all")]) }).strict();

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = requestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The avatar cleanup request is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    const result = await purgeAvatarFeedData(ownerId, body.data.days === "all" ? null : body.data.days);
    return NextResponse.json({ success: true, deleted: result.deleted, cutoff: result.cutoff?.toISOString() });
}
