import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedAvatars } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { uploadedAvatarImageUrl } from "@/lib/vrchat/avatar-image";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatAvatarSchema, vrchatFileSchema } from "@/lib/vrchat/types";

const avatarIdSchema = z.string().regex(/^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const MAX_IMAGE_BYTES = 20_000_000;
const allowedImageTypes = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
]);

export async function POST(request: NextRequest, context: RouteContext<"/api/avatars/[avatarId]/image">) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const avatarId = avatarIdSchema.safeParse((await context.params).avatarId);
    if (!avatarId.success) return response({ error: "The avatar ID is invalid." }, 400);
    let uploaded: FormDataEntryValue | null;
    try {
        uploaded = (await request.formData()).get("file");
    } catch {
        return response({ error: "The avatar image upload is invalid." }, 400);
    }
    if (!(uploaded instanceof File) || uploaded.size === 0 || uploaded.size >= MAX_IMAGE_BYTES || !allowedImageTypes.has(uploaded.type)) return response({ error: "Choose a PNG, JPEG, or WebP image smaller than 20 MB." }, 400);

    let expectedAuthCookie: string | undefined;
    let uploadAccepted = false;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { cookies });
        const current = vrchatAvatarSchema.parse(currentResponse.data);
        const currentCookies = { ...cookies, ...currentResponse.cookies };
        if (current.id !== avatarId.data || current.authorId !== ownerId) {
            await persistRotatedVrchatCookies(currentCookies, cookies.auth);
            return response({ error: "Only the avatar author can change its image." }, 403);
        }

        const formData = new FormData();
        formData.set("tag", "avatarimage");
        formData.set("file", uploaded, `avatar-image.${allowedImageTypes.get(uploaded.type)}`);
        const uploadResponse = await requestVrchat<unknown>("file/image", { method: "POST", cookies: currentCookies, formData });
        uploadAccepted = true;
        const uploadCookies = { ...currentCookies, ...uploadResponse.cookies };
        const parsedFile = vrchatFileSchema.safeParse(uploadResponse.data);
        const imageUrl = parsedFile.success ? uploadedAvatarImageUrl(parsedFile.data, ownerId) : "";
        if (!imageUrl) {
            await Promise.allSettled([persistRotatedVrchatCookies(uploadCookies, cookies.auth)]);
            return response({ error: "VRChat accepted the image but did not return a complete avatar image URL. Refresh before retrying.", uploadAccepted: true, refreshRequired: true }, 202);
        }

        const updateResponse = await requestVrchat<unknown>(`avatars/${avatarId.data}`, { method: "PUT", cookies: uploadCookies, body: { id: avatarId.data, imageUrl } });
        const parsedAvatar = vrchatAvatarSchema.safeParse(updateResponse.data);
        const avatar = parsedAvatar.success && parsedAvatar.data.id === current.id && parsedAvatar.data.authorId === ownerId ? parsedAvatar.data : { ...current, imageUrl };
        const persistence = await Promise.allSettled([upsertCachedAvatars(ownerId, [avatar], "owned"), persistRotatedVrchatCookies({ ...uploadCookies, ...updateResponse.cookies }, cookies.auth)]);
        return response({ avatar, refreshRequired: !parsedAvatar.success || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        const fallback = uploadAccepted ? "The image was uploaded, but the avatar could not be updated. Refresh before retrying." : "The avatar image could not be uploaded.";
        return response({ error: error instanceof VrchatApiError ? `${fallback} ${error.message}` : fallback, ...(uploadAccepted ? { uploadAccepted: true, refreshRequired: true } : {}) }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
