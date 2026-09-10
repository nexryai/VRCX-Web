"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown, ChevronRight, Ellipsis, GripVertical, Minus, X } from "lucide-react";

import { defaultNavigationConfig, type NavigationConfig, type NavigationItemKey, type NavigationLayoutEntry, navigationDefinitions, sanitizeNavigationConfig } from "@/lib/navigation-config";

const definitions = new Map(navigationDefinitions.map((definition) => [definition.key, definition]));

export function CustomNavigationDialog({ open, config, close, saved }: { open: boolean; config: NavigationConfig; close: () => void; saved: (config: NavigationConfig) => void }) {
    const [draft, setDraft] = useState(config);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<string | "new" | null>(null);
    const [folderName, setFolderName] = useState("");
    const [folderIcon, setFolderIcon] = useState("ri-folder-line");
    const [confirmReset, setConfirmReset] = useState(false);
    const [draggedKey, setDraggedKey] = useState<NavigationItemKey | null>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setDraft(structuredClone(config));
        setExpanded(new Set(config.layout.filter((entry) => entry.type === "folder").map((entry) => entry.id)));
        requestAnimationFrame(() => dialog.current?.focus());
        return () => returnFocus.current?.focus();
    }, [config, open]);

    if (!open) return null;
    const hidden = navigationDefinitions.filter((definition) => draft.hiddenKeys.includes(definition.key) && !definition.tool);

    function updateLayout(layout: NavigationLayoutEntry[]) {
        setDraft((current) => ({ ...current, layout }));
    }
    function moveTop(index: number, offset: number) {
        const next = [...draft.layout];
        const target = Math.max(0, Math.min(next.length - 1, index + offset));
        if (target === index) return;
        const [entry] = next.splice(index, 1);
        next.splice(target, 0, entry);
        updateLayout(next);
    }
    function hideItem(key: NavigationItemKey) {
        const layout: NavigationLayoutEntry[] = [];
        for (const entry of draft.layout) {
            if (entry.type === "item") {
                if (entry.key !== key) layout.push(entry);
            } else layout.push({ ...entry, items: entry.items.filter((item) => item !== key) });
        }
        setDraft({ layout, hiddenKeys: key.startsWith("tool-") ? draft.hiddenKeys : [...new Set([...draft.hiddenKeys, key])] });
    }
    function showItem(key: NavigationItemKey) {
        setDraft({ layout: [...draft.layout, { type: "item", key }], hiddenKeys: draft.hiddenKeys.filter((item) => item !== key) });
    }
    function deleteFolder(id: string) {
        updateLayout(draft.layout.flatMap((entry) => (entry.type === "folder" && entry.id === id ? entry.items.map((key) => ({ type: "item" as const, key })) : [entry])));
    }
    function moveChild(folderId: string, childIndex: number, offset: number) {
        updateLayout(
            draft.layout.map((entry) => {
                if (entry.type !== "folder" || entry.id !== folderId) return entry;
                const items = [...entry.items];
                const target = Math.max(0, Math.min(items.length - 1, childIndex + offset));
                if (target === childIndex) return entry;
                const [item] = items.splice(childIndex, 1);
                items.splice(target, 0, item);
                return { ...entry, items };
            }),
        );
    }
    function moveOut(folderId: string, key: NavigationItemKey) {
        const index = draft.layout.findIndex((entry) => entry.type === "folder" && entry.id === folderId);
        const layout = draft.layout.map((entry) => (entry.type === "folder" && entry.id === folderId ? { ...entry, items: entry.items.filter((item) => item !== key) } : entry));
        layout.splice(index + 1, 0, { type: "item", key });
        updateLayout(layout);
    }
    function moveIntoFolder(folderId: string, key: NavigationItemKey) {
        const layout: NavigationLayoutEntry[] = [];
        for (const entry of draft.layout) {
            if (entry.type === "item") {
                if (entry.key !== key) layout.push(entry);
            } else layout.push({ ...entry, items: entry.items.filter((item) => item !== key) });
        }
        updateLayout(layout.map((entry) => (entry.type === "folder" && entry.id === folderId ? { ...entry, items: [...entry.items, key] } : entry)));
        setExpanded((current) => new Set([...current, folderId]));
    }
    function openFolderEditor(entry?: Extract<NavigationLayoutEntry, { type: "folder" }>) {
        setEditing(entry?.id ?? "new");
        setFolderName(entry?.name ?? "");
        setFolderIcon(entry?.icon ?? "ri-folder-line");
    }
    function saveFolder() {
        if (!folderName.trim() || !/^ri-[a-z0-9-]+$/.test(folderIcon)) return;
        if (editing === "new") updateLayout([...draft.layout, { type: "folder", id: `custom-folder-${crypto.randomUUID()}`, name: folderName.trim(), icon: folderIcon, items: [] }]);
        else updateLayout(draft.layout.map((entry) => (entry.type === "folder" && entry.id === editing ? { ...entry, name: folderName.trim(), icon: folderIcon } : entry)));
        setEditing(null);
    }
    function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            close();
            return;
        }
        if (event.key !== "Tab" || editing || confirmReset) return;
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? [])];
        if (!focusable.length) return;
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? focusable.at(-1) : focusable[index - 1]) : index === focusable.length - 1 ? focusable[0] : focusable[index + 1];
        if (next) {
            event.preventDefault();
            next.focus();
        }
    }

    return (
        <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="custom-navigation-title" onKeyDown={trapFocus} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[720px] flex-col rounded-xl border border-border bg-popover p-4 shadow-2xl outline-none">
                <div className="flex items-center">
                    <h2 id="custom-navigation-title" className="text-sm font-semibold">
                        Customize Navigation Menu
                    </h2>
                    <button type="button" onClick={close} className="ml-auto grid size-8 place-items-center rounded-md hover:bg-accent" aria-label="Close">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="my-4 min-h-[40vh] max-h-[60vh] overflow-y-auto pr-3">
                    <div className="space-y-0.5">
                        {draft.layout.map((entry, index) =>
                            entry.type === "item" ? (
                                <NavRow
                                    key={entry.key}
                                    icon={definitions.get(entry.key)?.icon}
                                    label={definitions.get(entry.key)?.label ?? entry.key}
                                    first={index === 0}
                                    last={index === draft.layout.length - 1}
                                    up={() => moveTop(index, -1)}
                                    down={() => moveTop(index, 1)}
                                    actionLabel={entry.key.startsWith("tool-") ? "Remove" : "Hide"}
                                    action={() => hideItem(entry.key)}
                                    dragKey={entry.key}
                                    dragStart={setDraggedKey}
                                />
                            ) : (
                                <div
                                    key={entry.id}
                                    className="border-l-2 border-l-primary/60 bg-muted/25"
                                    onDragOver={(event) => {
                                        if (draggedKey) event.preventDefault();
                                    }}
                                    onDrop={() => {
                                        if (draggedKey) moveIntoFolder(entry.id, draggedKey);
                                        setDraggedKey(null);
                                    }}
                                >
                                    <NavRow
                                        icon={entry.icon}
                                        label={entry.name || "Folder name"}
                                        folder
                                        expanded={expanded.has(entry.id)}
                                        toggle={() =>
                                            setExpanded((current) => {
                                                const next = new Set(current);
                                                next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                                                return next;
                                            })
                                        }
                                        first={index === 0}
                                        last={index === draft.layout.length - 1}
                                        up={() => moveTop(index, -1)}
                                        down={() => moveTop(index, 1)}
                                        actionLabel="Edit Folder"
                                        action={() => openFolderEditor(entry)}
                                        secondaryLabel="Delete Folder"
                                        secondary={() => deleteFolder(entry.id)}
                                    />
                                    {expanded.has(entry.id) ? (
                                        <div className="pb-1 pl-8">
                                            {entry.items.length ? (
                                                entry.items.map((key, childIndex) => (
                                                    <NavRow
                                                        key={key}
                                                        icon={definitions.get(key)?.icon}
                                                        label={definitions.get(key)?.label ?? key}
                                                        first={childIndex === 0}
                                                        last={childIndex === entry.items.length - 1}
                                                        up={() => moveChild(entry.id, childIndex, -1)}
                                                        down={() => moveChild(entry.id, childIndex, 1)}
                                                        actionLabel={key.startsWith("tool-") ? "Remove" : "Hide"}
                                                        action={() => hideItem(key)}
                                                        secondaryLabel="Move out of folder"
                                                        secondary={() => moveOut(entry.id, key)}
                                                        dragKey={key}
                                                        dragStart={setDraggedKey}
                                                    />
                                                ))
                                            ) : (
                                                <div className="m-1 rounded-md border border-dashed border-muted-foreground/25 p-1.5 text-sm text-muted-foreground/50">Drag items here</div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ),
                        )}
                    </div>
                    {hidden.length ? (
                        <>
                            <div className="my-3 flex items-center gap-2">
                                <span className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground">Hidden</span>
                                <span className="h-px flex-1 bg-border" />
                            </div>
                            <div>
                                {hidden.map((item) => (
                                    <button key={item.key} type="button" onClick={() => showItem(item.key)} className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent">
                                        <span className="size-8" />
                                        <i className={`${item.icon} text-base`} />
                                        <span className="flex-1 text-left">{item.label}</span>
                                        <Minus className="size-3.5 opacity-0 group-hover:opacity-100" />
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <button type="button" onClick={() => openFolderEditor()} className="h-9 rounded-md border border-border px-3 text-xs hover:bg-accent">
                        New Folder
                    </button>
                    <button type="button" onClick={() => setConfirmReset(true)} className="h-9 px-3 text-xs text-destructive hover:bg-accent">
                        Restore Default
                    </button>
                    <span className="flex-1" />
                    <button type="button" onClick={close} className="h-9 rounded-md bg-secondary px-4 text-xs">
                        Cancel
                    </button>
                    <button type="button" onClick={() => saved(sanitizeNavigationConfig(draft))} className="h-9 rounded-md bg-primary px-4 text-xs text-primary-foreground">
                        Confirm
                    </button>
                </div>
            </div>
            {editing ? (
                <div className="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-3">
                    <div
                        role="dialog"
                        aria-modal="true"
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") setEditing(null);
                        }}
                        className="w-full max-w-[400px] rounded-xl border border-border bg-popover p-4 shadow-2xl"
                    >
                        <h3 className="text-sm font-semibold">{editing === "new" ? "New Folder" : "Edit Folder"}</h3>
                        <input value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus placeholder="Folder name" className="mt-4 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        <input value={folderIcon} onChange={(event) => setFolderIcon(event.target.value)} placeholder="Icon class (e.g. ri-menu-fold-line)" className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-md bg-secondary px-4 text-xs">
                                Cancel
                            </button>
                            <button type="button" disabled={!folderName.trim() || !/^ri-[a-z0-9-]+$/.test(folderIcon)} onClick={saveFolder} className="h-9 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            {confirmReset ? (
                <div className="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-3">
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") setConfirmReset(false);
                        }}
                        className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 shadow-2xl"
                    >
                        <h3 className="text-sm font-semibold">Restore Default</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Restore navigation to its default order?</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setConfirmReset(false)} className="h-9 rounded-md bg-secondary px-4 text-xs">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDraft(structuredClone(defaultNavigationConfig));
                                    setConfirmReset(false);
                                }}
                                className="h-9 rounded-md bg-destructive px-4 text-xs text-destructive-foreground"
                            >
                                Restore Default
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function NavRow({
    icon,
    label,
    folder,
    expanded,
    toggle,
    first,
    last,
    up,
    down,
    actionLabel,
    action,
    secondaryLabel,
    secondary,
    dragKey,
    dragStart,
}: {
    icon?: string;
    label: string;
    folder?: boolean;
    expanded?: boolean;
    toggle?: () => void;
    first: boolean;
    last: boolean;
    up: () => void;
    down: () => void;
    actionLabel: string;
    action: () => void;
    secondaryLabel?: string;
    secondary?: () => void;
    dragKey?: NavigationItemKey;
    dragStart?: (key: NavigationItemKey | null) => void;
}) {
    const [menu, setMenu] = useState(false);
    return (
        <div
            draggable={Boolean(dragKey)}
            onDragStart={() => {
                if (dragKey) dragStart?.(dragKey);
            }}
            onDragEnd={() => dragStart?.(null)}
            className="group relative flex min-h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
        >
            <GripVertical className="size-4 text-muted-foreground opacity-50" />
            {folder ? (
                <button type="button" onClick={toggle} aria-label={expanded ? "Collapse folder" : "Expand folder"}>
                    {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
            ) : (
                <span className="size-4" />
            )}
            <i className={`${icon ?? "ri-folder-line"} text-base`} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <button type="button" onClick={() => setMenu(!menu)} aria-label={`Manage ${label}`} className="grid size-6 place-items-center rounded opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100">
                <Ellipsis className="size-3.5" />
            </button>
            {menu ? (
                <div className="absolute top-7 right-1 z-20 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg">
                    <button
                        type="button"
                        disabled={first}
                        onClick={() => {
                            up();
                            setMenu(false);
                        }}
                        className="block h-8 w-full rounded px-2 text-left text-xs hover:bg-accent disabled:opacity-35"
                    >
                        Move up
                    </button>
                    <button
                        type="button"
                        disabled={last}
                        onClick={() => {
                            down();
                            setMenu(false);
                        }}
                        className="block h-8 w-full rounded px-2 text-left text-xs hover:bg-accent disabled:opacity-35"
                    >
                        Move down
                    </button>
                    {secondary ? (
                        <button
                            type="button"
                            onClick={() => {
                                secondary();
                                setMenu(false);
                            }}
                            className="block h-8 w-full rounded px-2 text-left text-xs hover:bg-accent"
                        >
                            {secondaryLabel}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => {
                            action();
                            setMenu(false);
                        }}
                        className="block h-8 w-full rounded px-2 text-left text-xs text-destructive hover:bg-accent"
                    >
                        {actionLabel}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
