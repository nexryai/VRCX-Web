import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { applyVrchatCookies, clearVrchatCookies, readVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema, vrchatFavoriteGroupSchema, vrchatFavoriteLimitsSchema, vrchatFavoriteSchema, vrchatWorldSchema } from "@/lib/vrchat/types";

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

    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to view favorites." }, { status: 401 });

    try {
        if (query.data.section === "records") {
            const upstream = await requestVrchat<unknown>("favorites", { cookies, query: { n: 100, offset: query.data.offset } });
            return favoriteResponse({ favorites: z.array(vrchatFavoriteSchema).parse(upstream.data) }, upstream.cookies);
        }
        if (query.data.section === "groups") {
            const upstream = await requestVrchat<unknown>("favorite/groups", { cookies, query: { n: 50, offset: query.data.offset } });
            return favoriteResponse({ groups: z.array(vrchatFavoriteGroupSchema).parse(upstream.data) }, upstream.cookies);
        }
        if (query.data.section === "limits") {
            const upstream = await requestVrchat<unknown>("auth/user/favoritelimits", { cookies });
            return favoriteResponse({ limits: vrchatFavoriteLimitsSchema.parse(upstream.data) }, upstream.cookies);
        }

        const endpoint = query.data.type === "world" ? "worlds/favorites" : "avatars/favorites";
        const schema = query.data.type === "world" ? vrchatWorldSchema : vrchatAvatarSchema;
        const upstream = await requestVrchat<unknown>(endpoint, { cookies, query: { n: 100, offset: 0, tag: query.data.tag } });
        return favoriteResponse({ items: z.array(schema).parse(upstream.data) }, upstream.cookies);
    } catch (error) {
        return favoriteError(error, "The VRChat favorites response was not valid.");
    }
}

export async function POST(request: NextRequest) {
    const cookies = readVrchatCookies(request.cookies);
    if (!cookies.auth) return NextResponse.json({ error: "Sign in to update favorites." }, { status: 401 });
    const body = addSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The favorite request is invalid." }, { status: 400 });

    try {
        const upstream = await requestVrchat<unknown>("favorites", { method: "POST", cookies, body: body.data });
        return favoriteResponse({ favorite: vrchatFavoriteSchema.parse(upstream.data) }, upstream.cookies);
    } catch (error) {
        return favoriteError(error, "The favorite could not be added.");
    }
}

function favoriteResponse(payload: object, cookies: Parameters<typeof applyVrchatCookies>[1]) {
    const response = NextResponse.json(payload);
    applyVrchatCookies(response, cookies);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

function favoriteError(error: unknown, fallback: string) {
    const message = error instanceof VrchatApiError ? error.message : fallback;
    const status = error instanceof VrchatApiError ? error.status : 502;
    const response = NextResponse.json({ error: message }, { status });
    if (status === 401) clearVrchatCookies(response);
    return response;
}
