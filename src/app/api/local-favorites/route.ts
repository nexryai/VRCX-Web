import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { addLocalFavorite, createLocalFavoriteGroup, deleteLocalFavorite, deleteLocalFavoriteGroup, listLocalFavoriteGroups, listLocalFavorites, renameLocalFavoriteGroup } from "@/lib/mongodb/local-favorites-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { VrchatApiError } from "@/lib/vrchat/client";
import { favoriteObjectIdSchema, localFavoriteGroupIdSchema } from "@/lib/vrchat/ids";

const kindSchema = z.enum(["avatar", "friend", "world"]);
const groupNameSchema = z.string().trim().min(1).max(64);
const querySchema = z.object({ kind: kindSchema, groupId: localFavoriteGroupIdSchema.optional() });
const createSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("create-group"), kind: kindSchema, name: groupNameSchema }), z.object({ action: z.literal("add"), kind: kindSchema, groupId: localFavoriteGroupIdSchema, objectId: favoriteObjectIdSchema })]);
const renameSchema = z.object({ groupId: localFavoriteGroupIdSchema, name: groupNameSchema });
const deleteSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("group"), groupId: localFavoriteGroupIdSchema }), z.object({ action: z.literal("item"), groupId: localFavoriteGroupIdSchema, objectId: favoriteObjectIdSchema })]);

export async function GET(request: NextRequest) {
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: "The local favorites query is invalid." }, { status: 400 });
    try {
        const ownerId = await requireActiveUserId();
        if (query.data.groupId) {
            const result = await listLocalFavorites(ownerId, query.data.groupId);
            if (!result || result.group.kind !== query.data.kind) return NextResponse.json({ error: "The local favorite group was not found." }, { status: 404 });
            return databaseResponse(result);
        }
        return databaseResponse({ groups: await listLocalFavoriteGroups(ownerId, query.data.kind) });
    } catch (error) {
        return localFavoriteError(error);
    }
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = createSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The local favorite request is invalid." }, { status: 400 });
    try {
        const ownerId = await requireActiveUserId();
        if (body.data.action === "create-group") return databaseResponse({ group: await createLocalFavoriteGroup(ownerId, body.data.kind, body.data.name) }, 201);
        if (!body.data.objectId.startsWith(`${body.data.kind === "avatar" ? "avtr" : body.data.kind === "friend" ? "usr" : "wrld"}_`)) return NextResponse.json({ error: "The favorite type does not match the object ID." }, { status: 400 });
        const result = await addLocalFavorite(ownerId, body.data.groupId, body.data.kind, body.data.objectId);
        if (result.status === "group-not-found") return NextResponse.json({ error: "The local favorite group was not found." }, { status: 404 });
        if (result.status === "item-not-found") return NextResponse.json({ error: "Load the item from VRChat before copying it to a local group." }, { status: 409 });
        return databaseResponse({ favorite: result.favorite }, 201);
    } catch (error) {
        return localFavoriteError(error);
    }
}

export async function PATCH(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = renameSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The local favorite group update is invalid." }, { status: 400 });
    try {
        const group = await renameLocalFavoriteGroup(await requireActiveUserId(), body.data.groupId, body.data.name);
        if (!group) return NextResponse.json({ error: "The local favorite group was not found." }, { status: 404 });
        return databaseResponse({ group });
    } catch (error) {
        return localFavoriteError(error);
    }
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The local favorite deletion is invalid." }, { status: 400 });
    try {
        const ownerId = await requireActiveUserId();
        if (body.data.action === "group") {
            const group = await deleteLocalFavoriteGroup(ownerId, body.data.groupId);
            if (!group) return NextResponse.json({ error: "The local favorite group was not found." }, { status: 404 });
        } else {
            await deleteLocalFavorite(ownerId, body.data.groupId, body.data.objectId);
        }
        return databaseResponse({ success: true });
    } catch (error) {
        return localFavoriteError(error);
    }
}

function databaseResponse(payload: object, status = 200) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

function localFavoriteError(error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return NextResponse.json({ error: "A local favorite group with this name already exists." }, { status: 409 });
    if (error instanceof VrchatApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Local favorites could not be updated." }, { status: 500 });
}
