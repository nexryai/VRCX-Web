import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getEntityMemo, saveEntityMemo } from "@/lib/mongodb/memo-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";

const entityTypeSchema = z.enum(["avatar", "user", "world"]);
const entityIdSchemas = {
    avatar: z.string().regex(/^avtr_[0-9a-f-]{36}$/i),
    user: z.string().regex(/^usr_[0-9a-f-]{36}$/i),
    world: z.string().regex(/^wrld_[0-9a-f-]{36}$/i),
} as const;
const bodySchema = z.object({ memo: z.string().max(10_000) }).strict();

async function params(context: RouteContext<"/api/memos/[entityType]/[entityId]">) {
    const raw = await context.params;
    const entityType = entityTypeSchema.safeParse(raw.entityType);
    if (!entityType.success) return null;
    const entityId = entityIdSchemas[entityType.data].safeParse(raw.entityId);
    return entityId.success ? { entityType: entityType.data, entityId: entityId.data } : null;
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/memos/[entityType]/[entityId]">) {
    const entity = await params(context);
    if (!entity) return NextResponse.json({ error: "The memo target is invalid." }, { status: 400 });
    const memo = await getEntityMemo(await requireActiveUserId(), entity.entityType, entity.entityId);
    const response = NextResponse.json({ memo });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/memos/[entityType]/[entityId]">) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const entity = await params(context);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!entity || !body.success) return NextResponse.json({ error: "The memo update is invalid." }, { status: 400 });
    const memo = await saveEntityMemo(await requireActiveUserId(), entity.entityType, entity.entityId, body.data.memo);
    const response = NextResponse.json({ memo });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
