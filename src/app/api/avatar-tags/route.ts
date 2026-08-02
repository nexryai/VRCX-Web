import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { listAvatarTags, replaceAvatarTags } from "@/lib/mongodb/avatar-tags-repository";
import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f-]{36}$/i);
const updateSchema = z.object({
    avatarId: avatarIdSchema,
    tags: z
        .array(z.object({ tag: z.string().trim().min(1).max(32), color: z.string().trim().max(64).nullable() }))
        .max(32)
        .refine((tags) => new Set(tags.map((entry) => entry.tag.toLocaleLowerCase())).size === tags.length),
});

export async function GET() {
    const ownerId = await requireActiveUserId();
    const response = NextResponse.json({ tags: await listAvatarTags(ownerId) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function PUT(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = updateSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The avatar tags are invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    await ensureMongoSchema();
    const avatar = await collections(await getMongoDatabase()).avatars.findOne({ ownerId, avatarId: body.data.avatarId, source: "owned" });
    if (!avatar) return NextResponse.json({ error: "The owned avatar was not found." }, { status: 404 });
    return NextResponse.json({ tags: await replaceAvatarTags(ownerId, body.data.avatarId, body.data.tags) });
}
