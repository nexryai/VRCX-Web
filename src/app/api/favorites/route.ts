import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getMongoDatabase } from "@/lib/mongodb/client";
import { collections } from "@/lib/mongodb/collections";
import { upsertCachedAvatars, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { ensureMongoSchema } from "@/lib/mongodb/migrations";
import { upsertFavoriteProjection } from "@/lib/mongodb/projection-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema, vrchatFavoriteLimitsSchema, vrchatFavoriteSchema, vrchatWorldSchema } from "@/lib/vrchat/types";

const querySchema = z.discriminatedUnion("section", [
    z.object({ section: z.literal("records"), offset: z.coerce.number().int().min(0).max(5_000).default(0) }),
    z.object({ section: z.literal("groups"), offset: z.coerce.number().int().min(0).max(500).default(0) }),
    z.object({ section: z.literal("limits") }),
    z.object({ section: z.literal("items"), type: z.enum(["avatar", "world"]), tag: z.string().regex(/^[a-z0-9_-]+$/i) }),
]);

const favoriteTagSchema = z.string().regex(/^[a-z0-9_-]+$/i);
const addSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("avatar"), favoriteId: z.string().regex(/^avtr_[0-9a-f-]{36}$/i), tags: favoriteTagSchema }),
    z.object({ type: z.literal("friend"), favoriteId: z.string().regex(/^usr_[0-9a-f-]{36}$/i), tags: favoriteTagSchema }),
    z.object({ type: z.enum(["vrcPlusWorld", "world"]), favoriteId: z.string().regex(/^wrld_[0-9a-f-]{36}$/i), tags: favoriteTagSchema }),
]);

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The favorites query is invalid." }, { status: 400 });

    try {
        if (query.data.section === "records") {
            const ownerId = await requireActiveUserId();
            await ensureMongoSchema();
            const documents = await collections(await getMongoDatabase())
                .favorites.find({ ownerId, active: true })
                .sort({ updatedAt: -1 })
                .skip(query.data.offset)
                .limit(100)
                .toArray();
            return favoriteDatabaseResponse({ favorites: documents.map((document) => document.favorite) });
        }
        if (query.data.section === "groups") {
            const ownerId = await requireActiveUserId();
            await ensureMongoSchema();
            const documents = await collections(await getMongoDatabase())
                .favoriteGroups.find({ ownerId, active: true })
                .sort({ "group.type": 1, "group.name": 1 })
                .skip(query.data.offset)
                .limit(50)
                .toArray();
            return favoriteDatabaseResponse({ groups: documents.map((document) => document.group) });
        }
        const cookies = await requireVrchatCookies();
        if (query.data.section === "limits") {
            const upstream = await requestVrchat<unknown>("auth/user/favoritelimits", { cookies });
            return await favoriteResponse({ limits: vrchatFavoriteLimitsSchema.parse(upstream.data) }, upstream.cookies);
        }

        const endpoint = query.data.type === "world" ? "worlds/favorites" : "avatars/favorites";
        const upstream = await requestVrchat<unknown>(endpoint, { cookies, query: { n: 100, offset: 0, tag: query.data.tag } });
        const ownerId = await requireActiveUserId();
        if (query.data.type === "world") {
            const items = z.array(vrchatWorldSchema).parse(upstream.data);
            await upsertCachedWorlds(ownerId, items, "favorite");
            return await favoriteResponse({ items }, upstream.cookies);
        }
        const items = z.array(vrchatAvatarSchema).parse(upstream.data);
        await upsertCachedAvatars(ownerId, items, "favorite");
        return await favoriteResponse({ items }, upstream.cookies);
    } catch (error) {
        return await favoriteError(error, "The VRChat favorites response was not valid.");
    }
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = addSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The favorite request is invalid." }, { status: 400 });

    try {
        const cookies = await requireVrchatCookies();
        const upstream = await requestVrchat<unknown>("favorites", { method: "POST", cookies, body: body.data });
        const favorite = vrchatFavoriteSchema.parse(upstream.data);
        await upsertFavoriteProjection(await requireActiveUserId(), favorite);
        return await favoriteResponse({ favorite }, upstream.cookies);
    } catch (error) {
        return await favoriteError(error, "The favorite could not be added.");
    }
}

function favoriteDatabaseResponse(payload: object) {
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

async function favoriteResponse(payload: object, cookies: VrchatCookies) {
    const response = NextResponse.json(payload);
    await persistRotatedVrchatCookies(cookies);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

async function favoriteError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) await clearVrchatSession();
    return response;
}
