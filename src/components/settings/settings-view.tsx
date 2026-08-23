"use client";

import { useEffect, useRef, useState } from "react";

import { AlertCircle, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Trash2, TriangleAlert, Upload } from "lucide-react";

import type { AppSettingsPayload } from "@/lib/app-settings";
import { clearImportedLegacyBrowserSettings, type LegacyBrowserSettingsImport, readLegacyBrowserSettings } from "@/lib/legacy-browser-settings";
import type { VrchatFavoriteGroup } from "@/lib/vrchat/types";

type Tab = "Interface" | "Social" | "System";
type PageSizeKey = "activityTablePageSize" | "friendListTablePageSize" | "moderationTablePageSize" | "myAvatarsTablePageSize" | "notificationTablePageSize";
type SettingsState = Required<
    Pick<
        AppSettingsPayload,
        | "activityTablePageSize"
        | "avatarAutoCleanupDays"
        | "favoriteSortByDate"
        | "friendListTablePageSize"
        | "localFavoriteFriendsGroups"
        | "moderationTablePageSize"
        | "myAvatarsTablePageSize"
        | "navigationCollapsed"
        | "notificationTablePageSize"
        | "recentActionCooldownEnabled"
        | "recentActionCooldownMinutes"
        | "theme"
    >
>;
type AvatarPurgeDays = 180 | 365 | 730 | "all";
type LegacyImportState = { checked: boolean; completed: boolean; importing: boolean; payload: LegacyBrowserSettingsImport | null };
type FavoriteGroupOption = { key: string; label: string; local: boolean };

const defaults: SettingsState = {
    theme: "dark",
    navigationCollapsed: false,
    favoriteSortByDate: false,
    localFavoriteFriendsGroups: [],
    recentActionCooldownEnabled: false,
    recentActionCooldownMinutes: 60,
    activityTablePageSize: 20,
    friendListTablePageSize: 20,
    notificationTablePageSize: 20,
    moderationTablePageSize: 20,
    myAvatarsTablePageSize: 20,
    avatarAutoCleanupDays: 0,
};

export function SettingsView({ version }: { version: string }) {
    const [tab, setTab] = useState<Tab>("System");
    const [settings, setSettings] = useState<SettingsState>(defaults);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
    const [favoriteGroupOptions, setFavoriteGroupOptions] = useState<FavoriteGroupOption[]>([]);
    const [legacyImport, setLegacyImport] = useState<LegacyImportState>({ checked: false, completed: false, importing: false, payload: null });
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error("Settings could not be loaded.");
                return response.json() as Promise<AppSettingsPayload>;
            })
            .then((value) => setSettings({ ...defaults, ...value }))
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) setMessage({ error: true, text: error instanceof Error ? error.message : "Settings could not be loaded." });
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void Promise.all([fetch("/api/favorites?section=groups&offset=0", { cache: "no-store", signal: controller.signal }), fetch("/api/local-favorites?kind=friend", { cache: "no-store", signal: controller.signal })])
            .then(async ([remoteResponse, localResponse]) => {
                if (!remoteResponse.ok || !localResponse.ok) throw new Error("Favorite groups could not be loaded.");
                const remote = (await remoteResponse.json()) as { groups?: VrchatFavoriteGroup[] };
                const local = (await localResponse.json()) as { groups?: Array<{ groupId: string; name: string }> };
                setFavoriteGroupOptions([
                    ...(remote.groups || []).filter((group) => group.type === "friend").map((group) => ({ key: `friend:${group.name}`, label: group.displayName || group.name, local: false })),
                    ...(local.groups || []).map((group) => ({ key: `local:${group.groupId}`, label: group.name, local: true })),
                ]);
            })
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) setMessage({ error: true, text: error instanceof Error ? error.message : "Favorite groups could not be loaded." });
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let payload: LegacyBrowserSettingsImport | null = null;
        try {
            payload = readLegacyBrowserSettings(window.localStorage);
        } catch {
            // Browser storage can be unavailable in hardened privacy modes. It
            // is only a one-time legacy source and is never authoritative.
        }
        void fetch("/api/settings/legacy-browser-import", { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error("Legacy browser settings status could not be loaded.");
                return response.json() as Promise<{ completed: boolean }>;
            })
            .then((status) => setLegacyImport({ checked: true, completed: status.completed, importing: false, payload }))
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) setMessage({ error: true, text: error instanceof Error ? error.message : "Legacy browser settings status could not be loaded." });
            });
        return () => controller.abort();
    }, []);

    async function change(patch: Partial<SettingsState>) {
        const previous = settings;
        const next = { ...settings, ...patch };
        setSettings(next);
        setMessage(null);
        if (patch.theme) document.documentElement.dataset.theme = patch.theme;
        window.dispatchEvent(new CustomEvent("vrcx:settings", { detail: patch }));
        try {
            const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
            if (!response.ok) throw new Error("The setting could not be saved.");
            window.dispatchEvent(new CustomEvent("vrcx:settings-saved", { detail: patch }));
        } catch (error) {
            setSettings(previous);
            if (patch.theme) document.documentElement.dataset.theme = previous.theme;
            window.dispatchEvent(new CustomEvent("vrcx:settings", { detail: previous }));
            setMessage({ error: true, text: error instanceof Error ? error.message : "The setting could not be saved." });
        }
    }

    async function importSettings(file: File) {
        if (!window.confirm("Replace the current application preferences with this backup?")) return;
        setMessage(null);
        try {
            const backup = JSON.parse(await file.text()) as unknown;
            const response = await fetch("/api/settings/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
            const payload = (await response.json()) as { error?: string; settings?: AppSettingsPayload };
            if (!response.ok || !payload.settings) throw new Error(payload.error || "The settings backup could not be imported.");
            const next = { ...defaults, ...payload.settings };
            setSettings(next);
            document.documentElement.dataset.theme = next.theme;
            window.dispatchEvent(new CustomEvent("vrcx:settings", { detail: next }));
            setMessage({ error: false, text: "Settings imported." });
        } catch (error) {
            setMessage({ error: true, text: error instanceof Error ? error.message : "The settings backup could not be imported." });
        } finally {
            if (fileInput.current) fileInput.current.value = "";
        }
    }

    async function importLegacySettings() {
        const legacy = legacyImport.payload;
        if (!legacy || legacyImport.completed || legacyImport.importing) return;
        const count = Object.keys(legacy.settings).length;
        if (!window.confirm(`Import ${count} legacy browser ${count === 1 ? "setting" : "settings"} into MongoDB? Only the detected theme, menu collapse, and My Avatars view values can be replaced.`)) return;
        setMessage(null);
        setLegacyImport((current) => ({ ...current, importing: true }));
        try {
            const response = await fetch("/api/settings/legacy-browser-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(legacy) });
            const payload = (await response.json()) as { error?: string; settings?: AppSettingsPayload; status?: { completed?: boolean } };
            if (response.status === 409 && payload.status?.completed) {
                if (payload.settings) {
                    const current = { ...defaults, ...payload.settings };
                    setSettings(current);
                    document.documentElement.dataset.theme = current.theme;
                    window.dispatchEvent(new CustomEvent("vrcx:settings", { detail: payload.settings }));
                }
                try {
                    clearImportedLegacyBrowserSettings(window.localStorage, legacy.settings);
                } catch {
                    // The durable import already completed on another page or
                    // browser; inaccessible legacy residue is non-authoritative.
                }
                setLegacyImport({ checked: true, completed: true, importing: false, payload: null });
                setMessage({ error: false, text: "Legacy browser settings were already imported." });
                return;
            }
            if (!response.ok || !payload.settings) throw new Error(payload.error || "Legacy browser settings could not be imported.");
            const next = { ...defaults, ...payload.settings };
            setSettings(next);
            document.documentElement.dataset.theme = next.theme;
            window.dispatchEvent(new CustomEvent("vrcx:settings", { detail: payload.settings }));
            try {
                clearImportedLegacyBrowserSettings(window.localStorage, legacy.settings);
            } catch {
                // MongoDB is authoritative after the successful response.
            }
            setLegacyImport({ checked: true, completed: true, importing: false, payload: null });
            setMessage({ error: false, text: `${count} legacy browser ${count === 1 ? "setting" : "settings"} imported into MongoDB.` });
        } catch (error) {
            setLegacyImport((current) => ({ ...current, importing: false }));
            setMessage({ error: true, text: error instanceof Error ? error.message : "Legacy browser settings could not be imported." });
        }
    }

    async function purgeAvatarFeed(days: AvatarPurgeDays) {
        setMessage(null);
        try {
            const response = await fetch("/api/settings/avatar-cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
            const payload = (await response.json()) as { deleted?: number; error?: string };
            if (!response.ok || payload.deleted === undefined) throw new Error(payload.error || "Avatar data could not be purged.");
            setMessage({ error: false, text: `${payload.deleted} avatar feed ${payload.deleted === 1 ? "entry" : "entries"} purged.` });
            return true;
        } catch (error) {
            setMessage({ error: true, text: error instanceof Error ? error.message : "Avatar data could not be purged." });
            return false;
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden p-2" aria-labelledby="settings-heading">
            <h1 id="settings-heading" className="shrink-0 p-1.5 text-lg font-semibold">
                Settings
            </h1>
            <div className="flex shrink-0 gap-5 overflow-x-auto border-b border-border px-1" role="tablist" aria-label="Settings categories">
                {(["System", "Interface", "Social"] as const).map((item) => (
                    <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-10 shrink-0 border-b-2 px-2 text-sm ${tab === item ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        {item}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4 sm:px-3">
                <div className="mx-auto flex max-w-4xl flex-col gap-10 pb-10">
                    {message ? (
                        <div className={`flex items-center gap-2 rounded-md border p-3 text-sm ${message.error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"}`} role="status">
                            {message.error ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                            {message.text}
                        </div>
                    ) : null}
                    {loading ? (
                        <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
                    ) : tab === "System" ? (
                        <SystemSettings version={version} fileInput={fileInput} importSettings={importSettings} legacyImport={legacyImport} importLegacySettings={importLegacySettings} settings={settings} change={change} purgeAvatarFeed={purgeAvatarFeed} />
                    ) : tab === "Interface" ? (
                        <InterfaceSettings settings={settings} change={change} />
                    ) : (
                        <SocialSettings settings={settings} options={favoriteGroupOptions} change={change} />
                    )}
                </div>
            </div>
        </section>
    );
}

function SocialSettings({ settings, options, change }: { settings: SettingsState; options: FavoriteGroupOption[]; change: (patch: Partial<SettingsState>) => Promise<void> }) {
    return (
        <>
            <SettingsGroup title="Interaction">
                <SettingsRow label="Recent Action Icon" description="Show a clock icon when a friend request was sent recently. Invite and request-invite actions remain excluded because they require the local VRChat client.">
                    <Switch checked={settings.recentActionCooldownEnabled} label="Recent Action Icon" change={(recentActionCooldownEnabled) => void change({ recentActionCooldownEnabled })} />
                </SettingsRow>
                {settings.recentActionCooldownEnabled ? (
                    <SettingsRow label="Cooldown (Minutes)">
                        <input
                            type="number"
                            min={1}
                            max={1440}
                            step={1}
                            value={settings.recentActionCooldownMinutes}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isInteger(value) && value >= 1 && value <= 1440) void change({ recentActionCooldownMinutes: value });
                            }}
                            className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Cooldown (Minutes)"
                        />
                    </SettingsRow>
                ) : null}
            </SettingsGroup>
            <SettingsGroup title="Favorites">
                <SettingsRow label="Favorite Groups Filter" description="Select which VRChat friend groups count as favorites in Feed and social views. When no VRChat group is selected, every VRChat friend favorite is included. Local favorites are always included.">
                    <FavoriteGroupSelector selected={settings.localFavoriteFriendsGroups} options={options} change={(localFavoriteFriendsGroups) => void change({ localFavoriteFriendsGroups })} />
                </SettingsRow>
            </SettingsGroup>
        </>
    );
}

function FavoriteGroupSelector({ selected, options, change }: { selected: string[]; options: FavoriteGroupOption[]; change: (selected: string[]) => void }) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const selectedSet = new Set(selected);
    const selectedLabels = options.filter((option) => selectedSet.has(option.key)).map((option) => option.label);

    function toggle(key: string) {
        change(selectedSet.has(key) ? selected.filter((value) => value !== key) : [...selected, key]);
    }

    return (
        <details
            ref={detailsRef}
            className="group relative w-48"
            onKeyDown={(event) => {
                if (event.key !== "Escape" || !detailsRef.current?.open) return;
                event.preventDefault();
                detailsRef.current.open = false;
                detailsRef.current.querySelector("summary")?.focus();
            }}
        >
            <summary className="flex h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-xs outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
                <span className={`min-w-0 truncate ${selectedLabels.length ? "text-foreground" : "text-muted-foreground"}`}>{selectedLabels.length ? selectedLabels.join(", ") : "Select Groups"}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div role="menu" aria-label="Favorite Groups Filter" className="absolute top-9 right-0 z-30 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                {options.length ? (
                    options.map((option, index) => (
                        <div key={option.key}>
                            {index > 0 && option.local && !options[index - 1]?.local ? <div className="my-1 border-t border-border" /> : null}
                            <button type="button" role="menuitemcheckbox" aria-checked={selectedSet.has(option.key)} onClick={() => toggle(option.key)} className="flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-muted">
                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input">{selectedSet.has(option.key) ? <Check className="size-3" /> : null}</span>
                                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                {option.local ? <span className="text-[10px] text-muted-foreground">Local</span> : null}
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="px-2 py-3 text-xs text-muted-foreground">No favorite groups</p>
                )}
            </div>
        </details>
    );
}

function SystemSettings({
    version,
    fileInput,
    importSettings,
    legacyImport,
    importLegacySettings,
    settings,
    change,
    purgeAvatarFeed,
}: {
    version: string;
    fileInput: React.RefObject<HTMLInputElement | null>;
    importSettings: (file: File) => Promise<void>;
    legacyImport: LegacyImportState;
    importLegacySettings: () => Promise<void>;
    settings: SettingsState;
    change: (patch: Partial<SettingsState>) => Promise<void>;
    purgeAvatarFeed: (days: AvatarPurgeDays) => Promise<boolean>;
}) {
    const [purgeOpen, setPurgeOpen] = useState(false);
    const [purgeDays, setPurgeDays] = useState<AvatarPurgeDays>(180);
    const [purging, setPurging] = useState(false);
    const purgingRef = useRef(false);
    const purgeDialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!purgeOpen) return;
        const previous = document.activeElement;
        purgeDialog.current?.focus();
        const handleDialogKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !purgingRef.current) setPurgeOpen(false);
            if (event.key !== "Tab" || !purgeDialog.current) return;
            const focusable = [...purgeDialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === purgeDialog.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", handleDialogKey);
        return () => {
            window.removeEventListener("keydown", handleDialogKey);
            if (previous instanceof HTMLElement) previous.focus();
        };
    }, [purgeOpen]);

    async function confirmPurge() {
        purgingRef.current = true;
        setPurging(true);
        const success = await purgeAvatarFeed(purgeDays);
        purgingRef.current = false;
        setPurging(false);
        if (success) setPurgeOpen(false);
    }

    return (
        <>
            <SettingsGroup title="General">
                <InfoRow label="Version" value={version} />
                <LinkRow label="Repository URL" value="github.com/vrcx-team/VRCX" href="https://github.com/vrcx-team/VRCX" />
                <LinkRow label="Support" value="VRCX Wiki" href="https://github.com/vrcx-team/VRCX/wiki" />
            </SettingsGroup>
            <SettingsGroup title="Application data">
                <SettingsRow label="Export settings" description="Download browser-compatible application preferences. VRChat session material and MongoDB connection details are never included.">
                    <a href="/api/settings/backup" download className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs hover:bg-muted">
                        <Download className="size-4" /> Export
                    </a>
                </SettingsRow>
                <SettingsRow label="Import settings" description="Validate and restore a VRCX Web settings backup into MongoDB.">
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="sr-only"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void importSettings(file);
                        }}
                    />
                    <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs hover:bg-muted">
                        <Upload className="size-4" /> Import
                    </button>
                </SettingsRow>
                <SettingsRow
                    label="Import legacy browser settings"
                    description={
                        legacyImport.completed
                            ? "The former root browser preferences were already migrated to MongoDB."
                            : legacyImport.payload
                              ? `${Object.keys(legacyImport.payload.settings).length} compatible ${Object.keys(legacyImport.payload.settings).length === 1 ? "setting was" : "settings were"} found in this browser. Import replaces only those values.`
                              : legacyImport.checked
                                ? "No compatible settings from the former browser-storage prototype were found in this browser."
                                : "Checking this browser for the former theme, menu collapse, and My Avatars view preferences."
                    }
                >
                    <button
                        type="button"
                        disabled={!legacyImport.checked || legacyImport.completed || !legacyImport.payload || legacyImport.importing}
                        onClick={() => void importLegacySettings()}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Upload className="size-4" /> {legacyImport.importing ? "Importing…" : legacyImport.completed ? "Imported" : legacyImport.payload ? "Import" : legacyImport.checked ? "Not found" : "Checking…"}
                    </button>
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title="Database cleanup">
                <SettingsRow label="Auto-Cleanup Avatar Data Older Than" description="Checked once per week by the server monitor.">
                    <select
                        aria-label="Auto-Cleanup Avatar Data Older Than"
                        value={settings.avatarAutoCleanupDays}
                        onChange={(event) => void change({ avatarAutoCleanupDays: Number(event.target.value) as SettingsState["avatarAutoCleanupDays"] })}
                        className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value={0}>Off</option>
                        <option value={30}>30 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>6 months</option>
                        <option value={365}>1 year</option>
                    </select>
                </SettingsRow>
                <SettingsRow label="Purge Avatar Feed Data">
                    <button type="button" onClick={() => setPurgeOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs hover:bg-muted">
                        <Trash2 className="size-4" /> Purge
                    </button>
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title="Legal notice">
                <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Copyright © 2019–2026 pypy and individual VRCX contributors.</p>
                    <p>This browser port reuses and adapts MIT-licensed VRCX design, behavior, assets, and source portions. See the included third-party notice for the full license.</p>
                    <a href="/about" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Open-source software notice <ExternalLink className="size-3" />
                    </a>
                </div>
            </SettingsGroup>
            {purgeOpen ? (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !purging) setPurgeOpen(false);
                    }}
                >
                    <div ref={purgeDialog} role="dialog" aria-modal="true" aria-labelledby="avatar-purge-title" tabIndex={-1} className="w-full max-w-md rounded-lg border border-border bg-popover p-5 shadow-2xl outline-none">
                        <h2 id="avatar-purge-title" className="text-base font-semibold">
                            Purge Avatar Feed Data
                        </h2>
                        <div className="mt-4 flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                            <span>It is strongly recommended to back up MongoDB before proceeding.</span>
                        </div>
                        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                            <p>This permanently deletes avatar change records from the database.</p>
                            <p>This action cannot be undone.</p>
                            <p>Other Feed events, Friend Log, Game Log sessions, current projections, memos, tags, and favorites are not deleted. The same Avatar event is also removed from its nested Game Log session view.</p>
                        </div>
                        <label className="mt-5 flex items-center justify-between gap-4 text-sm">
                            <span>Delete Avatar Data Older Than</span>
                            <select
                                value={purgeDays}
                                onChange={(event) => setPurgeDays(event.target.value === "all" ? "all" : (Number(event.target.value) as Exclude<AvatarPurgeDays, "all">))}
                                disabled={purging}
                                className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <option value={180}>6 months</option>
                                <option value={365}>1 year</option>
                                <option value={730}>2 years</option>
                                <option value="all">All data</option>
                            </select>
                        </label>
                        <div className="mt-6 flex justify-end gap-2">
                            <button type="button" disabled={purging} onClick={() => setPurgeOpen(false)} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-muted disabled:opacity-50">
                                Cancel
                            </button>
                            <button type="button" disabled={purging} onClick={() => void confirmPurge()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs text-destructive-foreground hover:brightness-110 disabled:opacity-50">
                                <Trash2 className="size-4" /> {purging ? "Purging…" : "Purge"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

function InterfaceSettings({ settings, change }: { settings: SettingsState; change: (patch: Partial<SettingsState>) => Promise<void> }) {
    return (
        <>
            <SettingsGroup title="Appearance">
                <SettingsRow label="Color theme">
                    <Segmented
                        value={settings.theme}
                        options={[
                            { value: "dark", label: "Dark" },
                            { value: "light", label: "Light" },
                        ]}
                        change={(theme) => void change({ theme })}
                    />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title="Navigation">
                <SettingsRow label="Collapse menu" description="Use VRCX's compact icon-only navigation at desktop widths.">
                    <Switch checked={settings.navigationCollapsed} label="Collapse menu" change={(navigationCollapsed) => void change({ navigationCollapsed })} />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title="Lists and tables">
                <SettingsRow label="Sort favorites by">
                    <Segmented
                        value={settings.favoriteSortByDate ? "date" : "name"}
                        options={[
                            { value: "name", label: "Name" },
                            { value: "date", label: "Date" },
                        ]}
                        change={(value) => void change({ favoriteSortByDate: value === "date" })}
                    />
                </SettingsRow>
                {(
                    [
                        ["Activity", "activityTablePageSize"],
                        ["Friend List", "friendListTablePageSize"],
                        ["Notifications", "notificationTablePageSize"],
                        ["Moderation", "moderationTablePageSize"],
                        ["My Avatars", "myAvatarsTablePageSize"],
                    ] as const
                ).map(([label, key]) => (
                    <SettingsRow key={key} label={`${label} page size`}>
                        <PageSize value={settings[key]} change={(value) => void change({ [key]: value } as Pick<SettingsState, PageSizeKey>)} />
                    </SettingsRow>
                ))}
            </SettingsGroup>
        </>
    );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-3.5">
            <h2 className="pl-0.5 text-base font-semibold">{title}</h2>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-[22px] py-[18px]">{children}</div>
        </section>
    );
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-10 flex-col justify-between gap-2 py-1 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">{label}</span>
                {description ? <span className="block text-xs leading-tight text-muted-foreground">{description}</span> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">{children}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-1 py-1">
            <span className="block text-sm font-medium leading-[18px]">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{value}</span>
        </div>
    );
}

function LinkRow({ label, value, href }: { label: string; value: string; href: string }) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted">
            <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-[18px]">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{value}</span>
            </div>
            <ExternalLink className="size-4 text-muted-foreground" />
        </a>
    );
}

function Switch({ checked, label, change }: { checked: boolean; label: string; change: (value: boolean) => void }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => change(!checked)} className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-input"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "left-[18px]" : "left-0.5"}`} />
        </button>
    );
}

function Segmented<T extends string>({ value, options, change }: { value: T; options: { value: T; label: string }[]; change: (value: T) => void }) {
    return (
        <div className="inline-flex rounded-md border border-input p-0.5">
            {options.map((option) => (
                <button key={option.value} type="button" onClick={() => change(option.value)} className={`h-7 rounded px-3 text-xs ${value === option.value ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function PageSize({ value, change }: { value: 20 | 50 | 100; change: (value: 20 | 50 | 100) => void }) {
    return (
        <select value={value} onChange={(event) => change(Number(event.target.value) as 20 | 50 | 100)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Page size">
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
        </select>
    );
}
