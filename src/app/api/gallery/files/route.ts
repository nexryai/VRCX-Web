import { type NextRequest, NextResponse } from "next/server";

import { getPersonalGallerySnapshot, replacePersonalGallerySnapshot, upsertPersonalGalleryFile } from "@/lib/mongodb/personal-files-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { isMutationOriginAllowed } from "@/lib/request-security";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { validatePersonalGalleryFiles } from "@/lib/vrchat/gallery-files";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";

const MAX_IMAGE_BYTES = 100_000_000;
const allowedImageTypes = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
]);

export async function GET(request: NextRequest) {
    const ownerId = await requireActiveUserId();
    if (request.nextUrl.searchParams.get("refresh") !== "true") {
        const cached = await getPersonalGallerySnapshot(ownerId);
        if (cached) return response({ files: cached.files, cached: true });
    }
    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        const upstream = await requestVrchat<unknown>("files", { cookies, query: { tag: "gallery", n: 100, offset: 0 } });
        Object.assign(cookies, upstream.cookies);
        const files = validatePersonalGalleryFiles(upstream.data, ownerId).toReversed();
        await replacePersonalGallerySnapshot(ownerId, files);
        const result = response({ files, cached: false });
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return result;
    } catch (error) {
        return galleryError(error, expectedAuthCookie, "The personal gallery response was not valid.");
    }
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return response({ error: "Cross-site requests are not allowed." }, 403);
    let uploaded: FormDataEntryValue | null;
    try {
        uploaded = (await request.formData()).get("file");
    } catch {
        return response({ error: "The gallery upload is invalid." }, 400);
    }
    if (!(uploaded instanceof File) || uploaded.size === 0 || uploaded.size >= MAX_IMAGE_BYTES || !allowedImageTypes.has(uploaded.type)) return response({ error: "Choose a PNG, JPEG, WebP, or GIF image smaller than 100 MB." }, 400);

    let expectedAuthCookie: string | undefined;
    try {
        const [ownerId, cookies] = await Promise.all([requireActiveUserId(), requireVrchatCookies()]);
        expectedAuthCookie = cookies.auth;
        const formData = new FormData();
        formData.set("tag", "gallery");
        formData.set("file", uploaded, `gallery-upload.${allowedImageTypes.get(uploaded.type)}`);
        const upstream = await requestVrchat<unknown>("file/image", { method: "POST", cookies, formData });
        Object.assign(cookies, upstream.cookies);
        const [file] = validatePersonalGalleryFiles([upstream.data], ownerId);
        const [projection, session] = await Promise.allSettled([upsertPersonalGalleryFile(ownerId, file), persistRotatedVrchatCookies(cookies, expectedAuthCookie)]);
        return response({ file, refreshRequired: projection.status === "rejected" || session.status === "rejected" });
    } catch (error) {
        return galleryError(error, expectedAuthCookie, "The gallery image response was not valid.");
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
