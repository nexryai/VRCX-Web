import { NextResponse } from "next/server";

import { getCosmeticIconFrameSnapshot } from "@/lib/mongodb/cosmetics-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { VrchatApiError } from "@/lib/vrchat/client";

export async function GET() {
    try {
        const ownerId = await requireActiveUserId();
        const snapshot = await getCosmeticIconFrameSnapshot(ownerId);
        return response({ frames: snapshot?.frames ?? [], observedAt: snapshot?.observedAt.toISOString() });
    } catch (error) {
        if (error instanceof VrchatApiError) return response({ error: error.message }, error.status);
        return response({ error: "Icon frames could not be loaded." }, 500);
    }
}

function response(payload: object, status = 200) {
    const result = NextResponse.json(payload, { status });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
}
