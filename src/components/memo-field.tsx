"use client";

import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";

type MemoEntityType = "avatar" | "user" | "world";

export function MemoField({ entityType, entityId }: { entityType: MemoEntityType; entityId: string }) {
    const [memo, setMemo] = useState("");
    const [savedMemo, setSavedMemo] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`/api/memos/${entityType}/${encodeURIComponent(entityId)}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const payload = (await response.json()) as { error?: string; memo?: string };
                if (!response.ok) throw new Error(payload.error || "Memo could not be loaded.");
                setMemo(payload.memo || "");
                setSavedMemo(payload.memo || "");
            })
            .catch((loadError) => {
                if (loadError instanceof DOMException && loadError.name === "AbortError") return;
                setError(loadError instanceof Error ? loadError.message : "Memo could not be loaded.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [entityId, entityType]);

    async function save() {
        if (memo === savedMemo) return;
        setSaving(true);
        setError("");
        try {
            const response = await fetch(`/api/memos/${entityType}/${encodeURIComponent(entityId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo }) });
            const payload = (await response.json()) as { error?: string; memo?: string };
            if (!response.ok) throw new Error(payload.error || "Memo could not be saved.");
            setMemo(payload.memo || "");
            setSavedMemo(payload.memo || "");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Memo could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <label className="block w-full p-1.5 text-[13px]">
            <span className="mb-1 flex items-center gap-1 font-medium leading-[18px]">Memo {loading || saving ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}</span>
            <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                onBlur={() => void save()}
                disabled={loading || saving}
                maxLength={10_000}
                rows={2}
                placeholder="Add a private memo"
                className="min-h-14 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring disabled:opacity-50"
            />
            {error ? <span className="mt-1 block text-[10px] text-destructive">{error}</span> : null}
        </label>
    );
}
