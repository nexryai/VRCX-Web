"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import { NoteExportDialog } from "@/components/tools/note-export-dialog";
import { ToolsDialogFrame } from "@/components/tools/tools-dialog-frame";
import { formatDiscordNamesCsv, formatFriendsListExports, formatOwnedAvatarsCsv, ownedAvatarsPageSchema } from "@/lib/tools-exports";
import type { VrchatAvatar } from "@/lib/vrchat/types";

type ToolDialog = "avatars" | "discord" | "friends" | "notes";

const tools: Array<{ key: ToolDialog; icon: string; title: string; description: string }> = [
    { key: "discord", icon: "ri-discord-line", title: "Discord Names", description: "Find the Discord usernames of your VRChat friends" },
    { key: "notes", icon: "ri-file-list-3-line", title: "Export User Memos", description: "Export VRCX user memos to VRChat notes" },
    { key: "friends", icon: "ri-file-list-3-line", title: "Export Friends List", description: "Export your friends list from VRChat" },
    { key: "avatars", icon: "ri-file-list-3-line", title: "Export Own Avatars", description: "Export your personal avatars from VRChat" },
];

export function ToolsView() {
    const currentUser = useCurrentUser();
    const { allFriends, loading: friendsLoading } = useFriends();
    const [dialog, setDialog] = useState<ToolDialog | null>(null);
    const [avatars, setAvatars] = useState<VrchatAvatar[]>([]);
    const [avatarsLoading, setAvatarsLoading] = useState(false);
    const [avatarError, setAvatarError] = useState("");
    const [exportCollapsed, setExportCollapsed] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const avatarController = useRef<AbortController | null>(null);
    const settingsSaveQueue = useRef<Promise<unknown>>(Promise.resolve());

    const exportFriends = useMemo(() => {
        const byId = new Map(allFriends.map((friend) => [friend.id, friend]));
        const ids = Array.isArray(currentUser.friends) ? currentUser.friends : allFriends.map((friend) => friend.id);
        return ids.map((id) => {
            const friend = byId.get(id);
            return { id, displayName: friend?.displayName || "", statusDescription: friend?.statusDescription, bio: friend?.bio, memo: friend?.$memo || "" };
        });
    }, [allFriends, currentUser.friends]);

    const friendExports = useMemo(() => formatFriendsListExports(exportFriends), [exportFriends]);
    const discordCsv = useMemo(() => formatDiscordNamesCsv(exportFriends.filter((friend) => friend.displayName)), [exportFriends]);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<{ toolsCollapsedCategories?: string[] }>)
            .then((settings) => setExportCollapsed(settings.toolsCollapsedCategories?.includes("user") === true))
            .catch(() => undefined)
            .finally(() => {
                if (!controller.signal.aborted) setSettingsLoaded(true);
            });
        return () => controller.abort();
    }, []);

    function toggleExport() {
        setExportCollapsed((current) => {
            const next = !current;
            settingsSaveQueue.current = settingsSaveQueue.current.catch(() => undefined).then(() => fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolsCollapsedCategories: next ? ["user"] : [] }) }));
            return next;
        });
    }

    async function openTool(next: ToolDialog, button: HTMLButtonElement) {
        trigger.current = button;
        setDialog(next);
        if (next !== "avatars") return;
        avatarController.current?.abort();
        const controller = new AbortController();
        avatarController.current = controller;
        setAvatars([]);
        setAvatarError("");
        setAvatarsLoading(true);
        try {
            const loaded: VrchatAvatar[] = [];
            for (let offset = 0; offset <= 5_000; offset += 50) {
                const response = await fetch(`/api/avatars?offset=${offset}`, { cache: "no-store", signal: controller.signal });
                const payload: unknown = await response.json();
                if (!response.ok) throw new Error(readError(payload, "Own avatars could not be loaded."));
                const parsed = ownedAvatarsPageSchema.safeParse(payload);
                if (!parsed.success) throw new Error("The owned-avatar response was not valid.");
                loaded.push(...parsed.data.avatars);
                if (parsed.data.avatars.length < 50) break;
            }
            setAvatars(loaded);
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) setAvatarError(error instanceof Error ? error.message : "Own avatars could not be loaded.");
        } finally {
            if (!controller.signal.aborted) setAvatarsLoading(false);
        }
    }

    function closeDialog() {
        avatarController.current?.abort();
        setDialog(null);
        requestAnimationFrame(() => trigger.current?.focus());
    }

    return (
        <section className="h-full min-h-0 overflow-y-auto p-4" aria-labelledby="tools-heading">
            <h1 id="tools-heading" className="text-sm font-medium">
                Tools
            </h1>
            <div className="mt-5 px-1 sm:px-5">
                <section aria-labelledby="tools-export-heading" className="mb-6">
                    <h2 id="tools-export-heading" className="mb-3">
                        <button
                            type="button"
                            disabled={!settingsLoaded}
                            onClick={toggleExport}
                            aria-expanded={!exportCollapsed}
                            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-base font-semibold hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
                        >
                            <i className={`ri-arrow-down-s-line mr-2 text-sm transition-transform duration-300 ${exportCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" /> Export
                        </button>
                    </h2>
                    <div className={`grid grid-cols-1 gap-4 sm:ml-4 sm:grid-cols-2 ${exportCollapsed ? "hidden" : ""}`}>
                        {tools.map((tool) => (
                            <button
                                key={tool.key}
                                type="button"
                                disabled={friendsLoading && tool.key !== "avatars"}
                                onClick={(event) => void openTool(tool.key, event.currentTarget)}
                                className="group flex min-h-20 items-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50"
                            >
                                <i className={`${tool.icon} inline-flex size-8 shrink-0 items-center justify-center text-2xl`} aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">{tool.title}</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{tool.description}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            {dialog === "discord" ? <ExportDialog title="Discord Names" description="Click load missing entries in the Friends List tab to search entire friends list" value={discordCsv} close={closeDialog} /> : null}
            {dialog === "friends" ? <FriendsExportDialog csv={friendExports.csv} json={friendExports.json} close={closeDialog} /> : null}
            {dialog === "avatars" ? <ExportDialog title="Export Own Avatars" value={formatOwnedAvatarsCsv(avatars)} loading={avatarsLoading} error={avatarError} close={closeDialog} /> : null}
            {dialog === "notes" ? <NoteExportDialog close={closeDialog} /> : null}
        </section>
    );
}

function ExportDialog({ title, description, value, loading = false, error = "", close }: { title: string; description?: string; value: string; loading?: boolean; error?: string; close: () => void }) {
    return (
        <ToolsDialogFrame title={title} description={description} close={close}>
            {loading ? (
                <div className="mt-4 flex h-[324px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Loading
                </div>
            ) : error ? (
                <div className="mt-4 flex h-[324px] items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
            ) : (
                <textarea readOnly rows={15} value={value} onClick={(event) => event.currentTarget.select()} aria-label={`${title} export`} className="mt-4 h-[324px] w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            )}
        </ToolsDialogFrame>
    );
}

function FriendsExportDialog({ csv, json, close }: { csv: string; json: string; close: () => void }) {
    const [tab, setTab] = useState<"CSV" | "JSON">("CSV");
    return (
        <ToolsDialogFrame title="Export Friends List" close={close}>
            <div className="mt-2.5 flex gap-5 border-b border-border" role="tablist" aria-label="Friends export format">
                {(["CSV", "JSON"] as const).map((format) => (
                    <button key={format} type="button" role="tab" aria-selected={tab === format} onClick={() => setTab(format)} className={`h-9 border-b-2 px-2 text-xs ${tab === format ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
                        {format}
                    </button>
                ))}
            </div>
            <textarea
                readOnly
                rows={15}
                value={tab === "CSV" ? csv : json}
                onClick={(event) => event.currentTarget.select()}
                aria-label={`${tab} friends export`}
                className="mt-4 h-[324px] w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        </ToolsDialogFrame>
    );
}

function readError(payload: unknown, fallback: string) {
    return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}
