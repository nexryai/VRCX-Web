import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedGroups, upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { upsertCachedUsers } from "@/lib/mongodb/user-repository";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { buildWorldSearchRequest } from "@/lib/vrchat/search";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatGroupSchema, vrchatUserSchema, vrchatWorldSchema } from "@/lib/vrchat/types";

const searchSchema = z
    .object({
        type: z.enum(["users", "worlds", "groups"]),
        q: z.string().trim().max(128).default(""),
        offset: z.coerce.number().int().min(0).max(5000).default(0),
        userField: z.enum(["displayName", "bio"]).default("displayName"),
        userSort: z.enum(["relevance", "last_login"]).default("relevance"),
        worldLabs: z.enum(["true", "false"]).default("false"),
        worldSortHeading: z.enum(["relevance", "featured", "trending", "updated", "created", "publication", "shuffle", "active", "recent", "favorite", "labs", "heat"]).default("relevance"),
        worldSortOrder: z.enum(["ascending", "descending"]).default("descending"),
        worldOwnership: z.enum(["any", "mine"]).default("any"),
        worldTag: z
            .string()
            .regex(/^[a-z0-9_,-]*$/i)
            .max(256)
            .default(""),
    })
    .refine((value) => value.q || (value.type === "worlds" && value.worldSortHeading !== "relevance"), { message: "A search query is required." });

export async function GET(request: NextRequest) {
    const search = searchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!search.success) {
        return NextResponse.json({ error: "Enter a valid search query." }, { status: 400 });
    }

    const { type, q, offset } = search.data;
    const world = buildWorldSearchRequest(search.data);
    const endpoint = type === "worlds" ? world.endpoint : type;
    const query = type === "users" ? { n: 10, offset, search: q, customFields: search.data.userField, sort: search.data.userSort } : type === "worlds" ? world.query : { n: 10, offset, query: q };

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>(endpoint, { cookies, query });
        const schema = type === "users" ? vrchatUserSchema : type === "worlds" ? vrchatWorldSchema : vrchatGroupSchema;
        const results = z.array(schema).parse(upstream.data);
        const ownerId = await requireActiveUserId();
        if (type === "users") await upsertCachedUsers(ownerId, z.array(vrchatUserSchema).parse(results), "search");
        if (type === "worlds") await upsertCachedWorlds(ownerId, z.array(vrchatWorldSchema).parse(results), "search");
        if (type === "groups") await upsertCachedGroups(ownerId, z.array(vrchatGroupSchema).parse(results), "search");
        const response = NextResponse.json({ type, results, offset, pageSize: 10 });
        await persistRotatedVrchatCookies(upstream.cookies, cookies.auth);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (error) {
        const message = error instanceof VrchatApiError ? error.message : "The VRChat search response was not valid.";
        const status = error instanceof VrchatApiError ? error.status : 502;
        const response = NextResponse.json({ error: message }, { status });
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response;
    }
}
