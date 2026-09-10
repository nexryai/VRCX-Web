"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/components/current-user-provider";
import { useFriends } from "@/components/friends/friends-provider";
import { GroupCalendarDialog } from "@/components/tools/group-calendar-dialog";
import { NoteExportDialog } from "@/components/tools/note-export-dialog";
import { ToolsDialogFrame } from "@/components/tools/tools-dialog-frame";
import { collectNavigationKeys, defaultNavigationConfig, type NavigationConfig, type NavigationItemKey, type NavigationLayoutEntry, sanitizeNavigationConfig } from "@/lib/navigation-config";
import { formatDiscordNamesCsv, formatFriendsListExports, formatOwnedAvatarsCsv, ownedAvatarsPageSchema } from "@/lib/tools-exports";
import type { VrchatAvatar } from "@/lib/vrchat/types";

type ToolDialog = "avatars" | "calendar" | "discord" | "friends" | "notes";

const tools: Array<{ key: ToolDialog; icon: string; title: string; description: string }> = [
    { key: "discord", icon: "ri-discord-line", title: "Discord Names", description: "Find the Discord usernames of your VRChat friends" },
    { key: "notes", icon: "ri-file-list-3-line", title: "Export User Memos", description: "Export VRCX user memos to VRChat notes" },
    { key: "friends", icon: "ri-file-list-3-line", title: "Export Friends List", description: "Export your friends list from VRChat" },
    { key: "avatars", icon: "ri-file-list-3-line", title: "Export Own Avatars", description: "Export your personal avatars from VRChat" },
];

export function ToolsView() {
    const searchParams = useSearchParams();
    const currentUser = useCurrentUser();
    const { allFriends, loading: friendsLoading } = useFriends();
    const [dialog, setDialog] = useState<ToolDialog | null>(null);
    const [avatars, setAvatars] = useState<VrchatAvatar[]>([]);
    const [avatarsLoading, setAvatarsLoading] = useState(false);
    const [avatarError, setAvatarError] = useState("");
    const [exportCollapsed, setExportCollapsed] = useState(false);
    const [groupCollapsed, setGroupCollapsed] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [navigationConfig, setNavigationConfig] = useState<NavigationConfig>(defaultNavigationConfig);
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
            .then((response) => response.json() as Promise<{ toolsCollapsedCategories?: string[]; navigationConfig?: NavigationConfig }>)
            .then((settings) => {
                setExportCollapsed(settings.toolsCollapsedCategories?.includes("user") === true);
                setGroupCollapsed(settings.toolsCollapsedCategories?.includes("group") === true);
                setNavigationConfig(sanitizeNavigationConfig(settings.navigationConfig));
            })
            .catch(() => undefined)
            .finally(() => {
                if (!controller.signal.aborted) setSettingsLoaded(true);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!settingsLoaded) return;
        const key = searchParams.get("tool");
        document.querySelector<HTMLButtonElement>(`[data-tool-key="${key}"]`)?.click();
    }, [searchParams, settingsLoaded]);

    useEffect(() => {
        if (dialog === null) trigger.current?.focus();
    }, [dialog]);

    function toggleCategory(category: "group" | "user") {
        const nextExport = category === "user" ? !exportCollapsed : exportCollapsed;
        const nextGroup = category === "group" ? !groupCollapsed : groupCollapsed;
        setExportCollapsed(nextExport);
        setGroupCollapsed(nextGroup);
        const categories = [...(nextGroup ? (["group"] as const) : []), ...(nextExport ? (["user"] as const) : [])];
        settingsSaveQueue.current = settingsSaveQueue.current.catch(() => undefined).then(() => fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolsCollapsedCategories: categories }) }));
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
    }

    async function togglePinned(toolKey: "group-calendar" | "discord-names" | "export-notes" | "export-friend-list" | "export-own-avatars") {
        const navKey = `tool-${toolKey}` as NavigationItemKey;
        const pinned = collectNavigationKeys(navigationConfig.layout).has(navKey);
        const layout: NavigationLayoutEntry[] = [];
        for (const entry of navigationConfig.layout) {
            if (pinned) {
                if (entry.type === "item") {
                    if (entry.key !== navKey) layout.push(entry);
                } else layout.push({ ...entry, items: entry.items.filter((key) => key !== navKey) });
            } else {
                if (entry.type === "item" && entry.key === "tools") layout.push({ type: "item", key: navKey });
                layout.push(entry);
            }
        }
        const next = sanitizeNavigationConfig({ ...navigationConfig, layout });
        setNavigationConfig(next);
        window.dispatchEvent(new CustomEvent("vrcx:navigation", { detail: next }));
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ navigationConfig: next }) });
        if (response.ok) window.dispatchEvent(new CustomEvent("vrcx:navigation", { detail: next }));
    }

    return (
        <section className="h-full min-h-0 overflow-y-auto p-4" aria-labelledby="tools-heading">
            <h1 id="tools-heading" className="text-sm font-medium">
                Tools
            </h1>
            <div className="mt-5 px-1 sm:px-5">
                <section aria-labelledby="tools-group-heading" className="mb-6">
                    <h2 id="tools-group-heading" className="mb-3">
                        <button
                            type="button"
                            disabled={!settingsLoaded}
                            onClick={() => toggleCategory("group")}
                            aria-expanded={!groupCollapsed}
                            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-base font-semibold hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
                        >
                            <i className={`ri-arrow-down-s-line mr-2 text-sm transition-transform duration-300 ${groupCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" /> Group
                        </button>
                    </h2>
                    <div className={`grid grid-cols-1 gap-4 sm:ml-4 sm:grid-cols-2 ${groupCollapsed ? "hidden" : ""}`}>
                        <div className="group relative rounded-lg border border-border bg-card hover:bg-accent/50">
                            <button data-tool-key="group-calendar" type="button" onClick={(event) => void openTool("calendar", event.currentTarget)} className="flex min-h-20 w-full items-start gap-3 p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <i className="ri-calendar-event-line inline-flex size-8 shrink-0 items-center justify-center text-2xl" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">Group Calendar</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">View upcoming events from your groups</span>
                                </span>
                            </button>
                            <PinButton pinned={collectNavigationKeys(navigationConfig.layout).has("tool-group-calendar")} toggle={() => void togglePinned("group-calendar")} />
                        </div>
                    </div>
                </section>
                <section aria-labelledby="tools-export-heading" className="mb-6">
                    <h2 id="tools-export-heading" className="mb-3">
                        <button
                            type="button"
                            disabled={!settingsLoaded}
                            onClick={() => toggleCategory("user")}
                            aria-expanded={!exportCollapsed}
                            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-base font-semibold hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
                        >
                            <i className={`ri-arrow-down-s-line mr-2 text-sm transition-transform duration-300 ${exportCollapsed ? "-rotate-90" : ""}`} aria-hidden="true" /> Export
                        </button>
                    </h2>
                    <div className={`grid grid-cols-1 gap-4 sm:ml-4 sm:grid-cols-2 ${exportCollapsed ? "hidden" : ""}`}>
                        {tools.map((tool) => (
                            <div key={tool.key} className="group relative rounded-lg border border-border bg-card hover:bg-accent/50">
                                <button
                                    data-tool-key={tool.key === "discord" ? "discord-names" : tool.key === "notes" ? "export-notes" : tool.key === "friends" ? "export-friend-list" : "export-own-avatars"}
                                    type="button"
                                    disabled={friendsLoading && tool.key !== "avatars"}
                                    onClick={(event) => void openTool(tool.key, event.currentTarget)}
                                    className="flex min-h-20 w-full items-start gap-3 p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50"
                                >
                                    <i className={`${tool.icon} inline-flex size-8 shrink-0 items-center justify-center text-2xl`} aria-hidden="true" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium">{tool.title}</span>
                                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{tool.description}</span>
                                    </span>
                                </button>
                                <PinButton
                                    pinned={collectNavigationKeys(navigationConfig.layout).has(`tool-${tool.key === "discord" ? "discord-names" : tool.key === "notes" ? "export-notes" : tool.key === "friends" ? "export-friend-list" : "export-own-avatars"}` as never)}
                                    toggle={() => void togglePinned(tool.key === "discord" ? "discord-names" : tool.key === "notes" ? "export-notes" : tool.key === "friends" ? "export-friend-list" : "export-own-avatars")}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {dialog === "discord" ? <ExportDialog title="Discord Names" description="Click load missing entries in the Friends List tab to search entire friends list" value={discordCsv} close={closeDialog} /> : null}
            {dialog === "friends" ? <FriendsExportDialog csv={friendExports.csv} json={friendExports.json} close={closeDialog} /> : null}
            {dialog === "avatars" ? <ExportDialog title="Export Own Avatars" value={formatOwnedAvatarsCsv(avatars)} loading={avatarsLoading} error={avatarError} close={closeDialog} /> : null}
            {dialog === "notes" ? <NoteExportDialog close={closeDialog} /> : null}
            {dialog === "calendar" ? <GroupCalendarDialog close={closeDialog} /> : null}
        </section>
    );
}

function PinButton({ pinned, toggle }: { pinned: boolean; toggle: () => void }) {
    return (
        <button
            type="button"
            onClick={toggle}
            title={pinned ? "Unpin" : "Pin to Navigation"}
            aria-label={pinned ? "Unpin" : "Pin to Navigation"}
            className={`absolute top-3 right-3 grid size-7 place-items-center rounded-md transition-opacity hover:bg-secondary focus:opacity-100 ${pinned ? "bg-secondary opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
            <span className="relative inline-flex">
                <i className="ri-side-bar-line text-base" />
                <i className={`${pinned ? "ri-subtract-line" : "ri-add-line"} absolute -top-1 -right-1 text-[10px]`} />
            </span>
        </button>
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
