import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getStoredVrchatSession } from "@/lib/mongodb/session-repository";
import { requireActiveUserId } from "@/lib/mongodb/single-user";
import { noteExportItemsSchema } from "@/lib/note-export";
import { cancelNoteExportJob, getNoteExportJob, listNoteExportCandidates, NoteExportValidationError, resumeNoteExportJob, startNoteExportJob } from "@/lib/note-export-job";
import { isMutationOriginAllowed } from "@/lib/request-security";

const startSchema = z.object({ items: noteExportItemsSchema }).strict();

export async function GET(request: NextRequest) {
    const ownerId = await requireActiveUserId();
    const job = await getNoteExportJob(ownerId);
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const retained = !refresh && job && ["cancelled", "error", "queued", "running"].includes(job.status) ? job.items.filter((item) => item.status === "pending") : null;
    const candidates = retained ?? (await listNoteExportCandidates(ownerId));
    const response = NextResponse.json({
        candidates: candidates.map((item) => ({ userId: item.userId, displayName: item.displayName, imageUrl: item.imageUrl, note: item.note })),
        job: job ? { status: job.status, processed: job.processed, total: job.total, error: job.error } : { status: "complete" as const, processed: 0, total: 0 },
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function POST(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    const body = startSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "The note export request is invalid." }, { status: 400 });
    const ownerId = await requireActiveUserId();
    const session = await getStoredVrchatSession();
    if (session?.status !== "authenticated" || session.activeUserId !== ownerId || !session.cookies.auth) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    try {
        const started = await startNoteExportJob(ownerId, body.data.items);
        if (!started) return NextResponse.json({ error: "A note export is already running." }, { status: 409 });
        await resumeNoteExportJob(ownerId, session.cookies);
        return NextResponse.json({ started: true }, { status: 202 });
    } catch (error) {
        if (error instanceof NoteExportValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
        throw error;
    }
}

export async function DELETE(request: NextRequest) {
    if (!isMutationOriginAllowed(request)) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    return NextResponse.json({ cancelled: await cancelNoteExportJob(await requireActiveUserId()) });
}
