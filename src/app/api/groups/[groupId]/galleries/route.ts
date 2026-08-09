import { type NextRequest, NextResponse } from "next/server";

import { getCachedGroup, upsertCachedGroups } from "@/lib/mongodb/entity-repository";
import { getCachedGroupGalleries, replaceCachedGroupGalleries } from "@/lib/mongodb/group-dialog-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { requestVrchat, VrchatApiError } from "@/lib/vrchat/client";
import { parseGroupGalleryPage, uniqueGroupGalleryImages } from "@/lib/vrchat/group-gallery";
import { groupGalleryIdSchema, groupIdSchema } from "@/lib/vrchat/ids";
import { clearVrchatSession, persistRotatedVrchatCookies, requireVrchatCookies } from "@/lib/vrchat/session";
import { type VrchatGroupGalleryImage, vrchatGroupGallerySchema, vrchatGroupSchema } from "@/lib/vrchat/types";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export async function GET(request: NextRequest, context: RouteContext<"/api/groups/[groupId]/galleries">) {
    const groupId = groupIdSchema.safeParse((await context.params).groupId);
    if (!groupId.success) return response({ error: "The group ID is invalid." }, 400);

    const ownerId = await requireActiveUserId();
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!refresh) {
        const cached = await getCachedGroupGalleries(ownerId, groupId.data);
        if (cached) return response({ ...cached, cached: true });
    }

    let expectedAuthCookie: string | undefined;
    try {
        const cookies = await requireVrchatCookies();
        expectedAuthCookie = cookies.auth;
        let group = await getCachedGroup(ownerId, groupId.data);
        if (!group?.galleries) {
            const upstream = await requestVrchat<unknown>(`groups/${groupId.data}`, { cookies, query: { includeRoles: true } });
            Object.assign(cookies, upstream.cookies);
            group = vrchatGroupSchema.parse(upstream.data);
            if (group.id !== groupId.data) throw new Error("The group response did not match the requested group.");
            await upsertCachedGroups(ownerId, [group], "lookup");
        }

        const galleries = vrchatGroupGallerySchema.array().parse(group.galleries || []);
        const images: VrchatGroupGalleryImage[] = [];
        const truncatedGalleryIds: string[] = [];
        for (const gallery of galleries) {
            const galleryId = groupGalleryIdSchema.parse(gallery.id);
            let offset = 0;
            let finalPageSize = 0;
            for (let page = 0; page < MAX_PAGES; page += 1) {
                const upstream = await requestVrchat<unknown>(`groups/${groupId.data}/galleries/${galleryId}`, { cookies, query: { n: PAGE_SIZE, offset } });
                Object.assign(cookies, upstream.cookies);
                const pageImages = parseGroupGalleryPage(upstream.data, groupId.data, galleryId);
                images.push(...pageImages);
                finalPageSize = pageImages.length;
                if (pageImages.length < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            }
            if (finalPageSize === PAGE_SIZE) truncatedGalleryIds.push(galleryId);
        }

        const uniqueImages = uniqueGroupGalleryImages(images);
        const observedAt = new Date();
        await replaceCachedGroupGalleries(ownerId, groupId.data, galleries, uniqueImages, truncatedGalleryIds, observedAt);
        await persistRotatedVrchatCookies(cookies, expectedAuthCookie);
        return response({ galleries, images: uniqueImages, truncatedGalleryIds, observedAt, cached: false });
    } catch (error) {
        const status = error instanceof VrchatApiError ? error.status : 502;
        if (status === 401 && expectedAuthCookie) await clearVrchatSession(expectedAuthCookie);
        return response({ error: error instanceof VrchatApiError ? error.message : "The group gallery response was not valid." }, status);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
