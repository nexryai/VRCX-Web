"use client";

import { useEffect, useRef } from "react";

import { X } from "lucide-react";

export function ToolsDialogFrame({ title, description, close, children, wide = false }: { title: string; description?: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
    const dialog = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeButton.current?.focus();
    }, []);

    function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])") ?? []);
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
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tools-dialog-title" onKeyDown={onKeyDown} className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-2xl ${wide ? "max-w-5xl" : "max-w-lg"}`}>
                <div className="flex items-center gap-2">
                    <h2 id="tools-dialog-title" className="text-base font-semibold">
                        {title}
                    </h2>
                    <button ref={closeButton} type="button" onClick={close} className="ml-auto inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label={`Close ${title}`}>
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </div>
                {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
                {children}
            </div>
        </div>
    );
}
