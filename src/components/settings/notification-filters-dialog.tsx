"use client";

import { useEffect, useRef } from "react";

import { defaultNotificationDeliveryFilters, type NotificationDeliveryFilters, notificationDeliveryFilterRows } from "@/lib/notification-delivery-filters";

export function NotificationFiltersDialog({ filters, close, change }: { filters: NotificationDeliveryFilters; close: () => void; change: (filters: NotificationDeliveryFilters) => void }) {
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => previous?.focus();
    }, []);

    function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
        if (!focusable.length) return;
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

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3" onMouseDown={(event) => event.target === event.currentTarget && close()}>
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="notification-filters-title" onKeyDown={trapFocus} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[560px] flex-col rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h2 id="notification-filters-title" className="shrink-0 text-base font-semibold">
                    Notification Filters
                </h2>
                <div className="mt-4 h-[75vh] min-h-0 flex-none overflow-y-auto text-[15px]">
                    {notificationDeliveryFilterRows.map((row) => (
                        <div key={row.key} className="mb-[5px] grid min-h-8 grid-cols-[120px_1fr] items-center sm:grid-cols-[190px_1fr]">
                            <span className="pr-2.5 text-right leading-tight">{row.label}</span>
                            <div className="inline-flex w-fit rounded-md border border-input bg-background" role="group" aria-label={row.label}>
                                {row.options.map((option) => {
                                    const selected = filters[row.key] === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => change({ ...filters, [row.key]: option.value })}
                                            className={`h-8 whitespace-nowrap border-l border-input px-1.5 text-xs first:border-l-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2.5 ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex shrink-0 justify-end gap-2">
                    <button type="button" onClick={() => change({ ...defaultNotificationDeliveryFilters })} className="h-9 rounded-md bg-secondary px-4 text-xs hover:bg-secondary/80">
                        Reset
                    </button>
                    <button type="button" onClick={close} className="h-9 rounded-md bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
