import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getAvatarGallerySnapshot, replaceAvatarGallerySnapshot, upsertAvatarGalleryFile } from "@/lib/mongodb/avatar-gallery-repository";
import { upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { validateAvatarGalleryFiles } from "@/lib/vrchat/avatar-gallery";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import type { VrchatCookies } from "@/lib/vrchat/protocol";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema, vrchatFileSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const MAX_IMAGE_BYTES = 100_000_000;
const allowedImageTypes = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
]);

async function fetchAvatar(ownerId: string, avatarId: string, cookies: VrchatCookies) {
    const upstream = await requestVrchat<unknown>(`avatars/${avatarId}`, { cookies });
    const avatar = vrchatAvatarSchema.parse(upstream.data);
    if (avatar.id !== avatarId || !avatar.authorId) throw new Error("The avatar response did not identify its author.");
    await upsertCachedAvatars(ownerId, [avatar], "lookup");
    return { avatar: { ...avatar, authorId: avatar.authorId }, cookies: { ...cookies, ...upstream.cookies } };
}

export async function GET(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/gallery">) {
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return response({ error: "The avatar ID is invalid." }, 400);
    const ownerId = await requireActiveUserId();
    if (request.nextUrl.searchParams.get("refresh") !== "true") {
        const cached = await getAvatarGallerySnapshot(ownerId, avatarId.data);
        if (cached) return response({ files: cached.files, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const avatarState = await fetchAvatar(ownerId, avatarId.data, cookies);
        const upstream = await requestVrchat<unknown>("files", { cookies: avatarState.cookies, query: { tag: "avatargallery", galleryId: avatarId.data, n: 100, offset: 0 } });
        const files = validateAvatarGalleryFiles(upstream.data, avatarState.avatar.authorId);
        const rotatedCookies = { ...avatarState.cookies, ...upstream.cookies };
        await replaceAvatarGallerySnapshot(ownerId, avatarId.data, avatarState.avatar.authorId, files);
        await persistRotatedVrchatCookies(rotatedCookies, cookies.auth);
        return response({ files, cached: false });
    } catch (error) {
        return await galleryError(error, expectedAuthCookie, "The avatar gallery could not be loaded.");
    }
}

export async function POST(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/gallery">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return response({ error: "The avatar ID is invalid." }, 400);
    let uploaded: FormDataEntryValue | null;
    try {
        uploaded = (await request.formData()).get("file");
    } catch {
        return response({ error: "The avatar gallery upload is invalid." }, 400);
    }
    if (!(uploaded instanceof File) || uploaded.size === 0 || uploaded.size >= MAX_IMAGE_BYTES || !allowedImageTypes.has(uploaded.type)) return response({ error: "Choose a PNG, JPEG, WebP, or GIF image smaller than 100 MB." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const avatarState = await fetchAvatar(ownerId, avatarId.data, cookies);
        if (avatarState.avatar.authorId !== ownerId) {
            await Promise.allSettled([persistRotatedVrchatCookies(avatarState.cookies, cookies.auth)]);
            return response({ error: "Only the avatar author can upload gallery images." }, 403);
        }
        const formData = new FormData();
        // VRCX associates avatargallery files with this fixed galleryId field;
        // it is deliberately not accepted from arbitrary browser input.
        formData.set("tag", "avatargallery");
        formData.set("galleryId", avatarId.data);
        formData.set("file", uploaded, `avatar-gallery.${allowedImageTypes.get(uploaded.type)}`);
        const upstream = await requestVrchat<unknown>("file/image", { method: "POST", cookies: avatarState.cookies, formData });
        const parsed = vrchatFileSchema.safeParse(upstream.data);
        const file = parsed.success && parsed.data.ownerId === ownerId && parsed.data.tags.includes("avatargallery") ? parsed.data : undefined;
        // The upload is non-idempotent. Once VRChat accepted it, a malformed
        // response or local write failure must request repair, not invite retry.
        const persistence = await Promise.allSettled([...(file ? [upsertAvatarGalleryFile(ownerId, avatarId.data, ownerId, file)] : []), persistRotatedVrchatCookies({ ...avatarState.cookies, ...upstream.cookies }, cookies.auth)]);
        return response({ success: true, ...(file ? { file } : {}), refreshRequired: !file || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        return await galleryError(error, expectedAuthCookie, "The avatar gallery image could not be uploaded.");
    }
}

async function galleryError(error: unknown, expectedAuthCookie: string | undefined, fallback: string) {
    const status = error instanceof VrchatApiError ? error.status : 502;
    if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
    return response({ error: error instanceof VrchatApiError ? error.message : fallback }, status);
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
