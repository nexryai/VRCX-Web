"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Loader2, RefreshCw, Upload, X } from "lucide-react";

import { VrchatImage } from "@/components/vrchat-image";
import { latestVrchatFileUrl } from "@/lib/vrchat/gallery-files";
import type { VrchatFile } from "@/lib/vrchat/types";

export function GalleryFilePicker({ vrcPlus, close, select }: { vrcPlus: boolean; close: () => void; select: (file: VrchatFile, url: string) => void }) {
    const [files, setFiles] = useState<VrchatFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const dialog = useRef<HTMLDivElement>(null);
    const noneButton = useRef<HTMLButtonElement>(null);
    const uploadInput = useRef<HTMLInputElement>(null);

    const load = useCallback(async (refresh = false) => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/gallery/files${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
            const payload = (await response.json()) as { error?: string; files?: VrchatFile[] };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok) throw new Error(payload.error || "The personal gallery could not be loaded.");
            setFiles(payload.files || []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "The personal gallery could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        noneButton.current?.focus();
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
                return;
            }
            if (event.key !== "Tab" || !dialog.current) return;
            const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
        window.addEventListener("keydown", handleKey, true);
        return () => window.removeEventListener("keydown", handleKey, true);
    }, [close, load]);

    async function upload(file: File) {
        setUploading(true);
        setError("");
        try {
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch("/api/gallery/files", { method: "POST", body: formData });
            const payload = (await response.json()) as { error?: string; file?: VrchatFile; refreshRequired?: boolean };
            if (response.status === 401) window.location.assign("/login");
            if (!response.ok || !payload.file) throw new Error(payload.error || "The gallery image could not be uploaded.");
            setFiles((current) => [payload.file as VrchatFile, ...current.filter((item) => item.id !== payload.file?.id)]);
            if (payload.refreshRequired) void load(true);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "The gallery image could not be uploaded.");
        } finally {
            setUploading(false);
            if (uploadInput.current) uploadInput.current.value = "";
        }
    }

    return (
        <div data-gallery-file-picker className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 sm:p-4">
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gallery-file-picker-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[900px] overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h4 id="gallery-file-picker-title" className="font-semibold">
                    Select Gallery Image
                </h4>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span>Gallery</span>
                    <span className="text-muted-foreground">{files.length}/64</span>
                    <button ref={noneButton} type="button" onClick={close} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted">
                        <X className="size-3.5" /> None
                    </button>
                    <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
                    </button>
                    <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
                    <button type="button" onClick={() => uploadInput.current?.click()} disabled={!vrcPlus || uploading} title={vrcPlus ? undefined : "VRChat+ is required"} className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 hover:bg-muted disabled:opacity-40">
                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
                    </button>
                </div>
                {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
                <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,200px)] gap-5">
                    {files.map((file) => {
                        const url = latestVrchatFileUrl(file);
                        return url ? (
                            <button key={file.id} type="button" onClick={() => select(file, url)} className="size-[200px] overflow-hidden rounded-[20px] bg-muted focus:ring-2 focus:ring-ring" aria-label={`Select gallery image ${file.name || file.id}`}>
                                <VrchatImage src={url} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                            </button>
                        ) : null;
                    })}
                </div>
                {!loading && !files.some((file) => latestVrchatFileUrl(file)) ? <div className="py-10 text-center text-sm text-muted-foreground">No gallery images.</div> : null}
            </div>
        </div>
    );
}
