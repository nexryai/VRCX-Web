import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { upsertCachedWorlds } from "@/lib/mongodb/entity-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { uploadedEntityImageUrl } from "@/lib/vrchat/avatar-image";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { vrchatFileSchema, vrchatWorldSchema } from "@/lib/vrchat/types";

const worldIdSchema = z.string().regex(/^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const MAX_IMAGE_BYTES = 20_000_000;
const allowedImageTypes = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
]);

export async function POST(request: NextRequest, context: { params: Promise<{ worldId: string }> }) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    const worldId = worldIdSchema.safeParse((await context.params).worldId);
    if (!worldId.success) return response({ error: "The world ID is invalid." }, 400);
    let uploaded: FormDataEntryValue | null;
    try {
        uploaded = (await request.formData()).get("file");
    } catch {
        return response({ error: "The world image upload is invalid." }, 400);
    }
    if (!(uploaded instanceof File) || uploaded.size === 0 || uploaded.size >= MAX_IMAGE_BYTES || !allowedImageTypes.has(uploaded.type)) return response({ error: "Choose a PNG, JPEG, or WebP image smaller than 20 MB." }, 400);

    let expectedAuthCookie: string | undefined;
    let uploadAccepted = false;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const currentResponse = await requestVrchat<unknown>(`worlds/${worldId.data}`, { cookies });
        const current = vrchatWorldSchema.parse(currentResponse.data);
        const currentCookies = { ...cookies, ...currentResponse.cookies };
        if (current.id !== worldId.data || current.authorId !== ownerId) {
            await persistRotatedVrchatCookies(currentCookies, cookies.auth);
            return response({ error: "Only the world author can change its image." }, 403);
        }

        const formData = new FormData();
        formData.set("tag", "worldimage");
        formData.set("file", uploaded, `world-image.${allowedImageTypes.get(uploaded.type)}`);
        const uploadResponse = await requestVrchat<unknown>("file/image", { method: "POST", cookies: currentCookies, formData });
        uploadAccepted = true;
        const uploadCookies = { ...currentCookies, ...uploadResponse.cookies };
        const parsedFile = vrchatFileSchema.safeParse(uploadResponse.data);
        const imageUrl = parsedFile.success ? uploadedEntityImageUrl(parsedFile.data, ownerId, "worldimage") : "";
        if (!imageUrl) {
            await Promise.allSettled([persistRotatedVrchatCookies(uploadCookies, cookies.auth)]);
            return response({ error: "VRChat accepted the image but did not return a complete world image URL. Refresh before retrying.", uploadAccepted: true, refreshRequired: true }, 202);
        }

        const updateResponse = await requestVrchat<unknown>(`worlds/${worldId.data}`, { method: "PUT", cookies: uploadCookies, body: { id: worldId.data, imageUrl } });
        const parsedWorld = vrchatWorldSchema.safeParse(updateResponse.data);
        const world = parsedWorld.success && parsedWorld.data.id === current.id && parsedWorld.data.authorId === ownerId ? parsedWorld.data : { ...current, imageUrl };
        const persistence = await Promise.allSettled([upsertCachedWorlds(ownerId, [world], "lookup"), persistRotatedVrchatCookies({ ...uploadCookies, ...updateResponse.cookies }, cookies.auth)]);
        return response({ world, refreshRequired: !parsedWorld.success || persistence.some((result) => result.status === "rejected") });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        const fallback = uploadAccepted ? "The image was uploaded, but the world could not be updated. Refresh before retrying." : "The world image could not be uploaded.";
        return response({ error: error instanceof VrchatApiError ? `${fallback} ${error.message}` : fallback, ...(uploadAccepted ? { uploadAccepted: true, refreshRequired: true } : {}) }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
