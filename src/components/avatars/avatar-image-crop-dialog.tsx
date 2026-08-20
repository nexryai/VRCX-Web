"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Expand, FlipHorizontal, FlipVertical, Frame, Loader2, RefreshCw, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 900;

export function AvatarImageCropDialog({ file, uploading, error, cancel, confirm }: { file: File; uploading: boolean; error: string; cancel: () => void; confirm: (blob: Blob) => void }) {
    const [source, setSource] = useState("");
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [rotation, setRotation] = useState(0);
    const [flipHorizontal, setFlipHorizontal] = useState(false);
    const [flipVertical, setFlipVertical] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [freeMode, setFreeMode] = useState(false);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [cropping, setCropping] = useState(false);
    const [cropFailure, setCropFailure] = useState("");
    const frame = useRef<HTMLDivElement>(null);
    const image = useRef<HTMLImageElement | null>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const firstControl = useRef<HTMLButtonElement>(null);
    const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setSource(objectUrl);
        const loaded = new window.Image();
        loaded.onload = () => {
            image.current = loaded;
            setImageSize({ width: loaded.naturalWidth, height: loaded.naturalHeight });
        };
        loaded.src = objectUrl;
        return () => {
            image.current = null;
            URL.revokeObjectURL(objectUrl);
        };
    }, [file]);

    useEffect(() => firstControl.current?.focus(), []);

    const rotatedSize = useMemo(() => (Math.abs(rotation % 180) === 90 ? { width: imageSize.height, height: imageSize.width } : imageSize), [imageSize, rotation]);

    function reset() {
        setRotation(0);
        setFlipHorizontal(false);
        setFlipVertical(false);
        setZoom(1);
        setFreeMode(false);
        setOffset({ x: 0, y: 0 });
        setCropFailure("");
    }

    function baseScale() {
        const bounds = frame.current?.getBoundingClientRect();
        if (!bounds || !rotatedSize.width || !rotatedSize.height) return 1;
        const scales = [bounds.width / rotatedSize.width, bounds.height / rotatedSize.height];
        return (freeMode ? Math.min(...scales) : Math.max(...scales)) * zoom;
    }

    async function crop() {
        const sourceImage = image.current;
        const bounds = frame.current?.getBoundingClientRect();
        if (!sourceImage || !bounds?.width || !bounds.height) return;
        setCropping(true);
        setCropFailure("");
        try {
            const canvas = document.createElement("canvas");
            canvas.width = OUTPUT_WIDTH;
            canvas.height = OUTPUT_HEIGHT;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas is unavailable.");
            const outputScale = OUTPUT_WIDTH / bounds.width;
            context.translate(OUTPUT_WIDTH / 2 + offset.x * outputScale, OUTPUT_HEIGHT / 2 + offset.y * outputScale);
            context.rotate((rotation * Math.PI) / 180);
            const scale = baseScale() * outputScale;
            context.scale((flipHorizontal ? -1 : 1) * scale, (flipVertical ? -1 : 1) * scale);
            context.drawImage(sourceImage, -imageSize.width / 2, -imageSize.height / 2);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("The cropped image could not be created.");
            confirm(blob);
        } catch (cropError) {
            setCropFailure(cropError instanceof Error ? cropError.message : "The cropped image could not be created.");
        } finally {
            setCropping(false);
        }
    }

    function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? []);
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    }

    const scale = baseScale();
    const busy = uploading || cropping;
    return (
        <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/70 p-3">
            <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="avatar-image-crop-title" onKeyDown={trapFocus} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[850px] flex-col rounded-xl border border-border bg-popover p-4 shadow-2xl">
                <h3 id="avatar-image-crop-title" className="shrink-0 text-sm font-semibold">
                    Change Avatar Image
                </h3>
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                    <div
                        ref={frame}
                        className="relative mx-auto aspect-4/3 max-h-[400px] w-full max-w-[533px] touch-none cursor-move overflow-hidden bg-[linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
                        onPointerDown={(event) => {
                            if (busy) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
                        }}
                        onPointerMove={(event) => {
                            if (!drag.current || drag.current.pointerId !== event.pointerId) return;
                            setOffset({ x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y });
                        }}
                        onPointerUp={() => {
                            drag.current = null;
                        }}
                    >
                        {source ? (
                            // The selected local Blob remains in memory until Crop Image is confirmed.
                            <span
                                className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center select-none"
                                style={{
                                    width: imageSize.width * scale,
                                    height: imageSize.height * scale,
                                    backgroundImage: `url(${source})`,
                                    backgroundSize: "100% 100%",
                                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${flipHorizontal ? -1 : 1}, ${flipVertical ? -1 : 1})`,
                                }}
                            />
                        ) : null}
                        <span className="pointer-events-none absolute inset-0 border border-white/60 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.5)]" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
                        <ToolButton ref={firstControl} label="Rotate Left" disabled={busy} action={() => setRotation((value) => value - 90)} icon={<RotateCcw />} />
                        <ToolButton label="Rotate Right" disabled={busy} action={() => setRotation((value) => value + 90)} icon={<RotateCw />} />
                        <Divider />
                        <ToolButton label="Flip Horizontal" disabled={busy} action={() => setFlipHorizontal((value) => !value)} icon={<FlipHorizontal />} />
                        <ToolButton label="Flip Vertical" disabled={busy} action={() => setFlipVertical((value) => !value)} icon={<FlipVertical />} />
                        <Divider />
                        <ToolButton label="Zoom Out" disabled={busy} ghost action={() => setZoom((value) => Math.max(MIN_ZOOM, value * 0.8))} icon={<ZoomOut />} />
                        <input aria-label="Zoom" type="range" min="0" max="100" step="1" value={zoomToSlider(zoom)} disabled={busy} onChange={(event) => setZoom(sliderToZoom(Number(event.target.value)))} className="w-28 accent-primary" />
                        <ToolButton label="Zoom In" disabled={busy} ghost action={() => setZoom((value) => Math.min(MAX_ZOOM, value * 1.2))} icon={<ZoomIn />} />
                        <Divider />
                        <ToolButton label={freeMode ? "Fit Mode" : "Free Mode"} disabled={busy} active={freeMode} action={() => setFreeMode((value) => !value)} icon={freeMode ? <Expand /> : <Frame />} />
                        <ToolButton label="Reset" disabled={busy} action={reset} icon={<RefreshCw />} />
                    </div>
                    {error || cropFailure ? <p className="mt-3 text-xs text-destructive">{error || cropFailure}</p> : null}
                </div>
                <div className="mt-4 flex shrink-0 justify-end gap-2">
                    <button type="button" onClick={cancel} disabled={busy} className="h-9 rounded-md bg-secondary px-4 text-xs disabled:opacity-40">
                        Cancel
                    </button>
                    <button type="button" onClick={() => void crop()} disabled={busy || !imageSize.width} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40">
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null} {uploading ? "Uploading…" : "Crop Image"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Divider() {
    return <span className="mx-1 h-5 w-px bg-border" />;
}

function ToolButton({ ref, label, disabled, action, icon, ghost = false, active = false }: { ref?: React.Ref<HTMLButtonElement>; label: string; disabled: boolean; action: () => void; icon: React.ReactNode; ghost?: boolean; active?: boolean }) {
    return (
        <button
            ref={ref}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={action}
            className={`inline-flex size-8 items-center justify-center rounded-full disabled:opacity-40 [&>svg]:size-4 ${active ? "bg-primary text-primary-foreground" : ghost ? "hover:bg-muted" : "border border-input hover:bg-muted"}`}
        >
            {icon}
        </button>
    );
}

function zoomToSlider(zoom: number) {
    return Math.round(((Math.log(zoom) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))) * 100);
}

function sliderToZoom(value: number) {
    return Math.exp(Math.log(MIN_ZOOM) + (value / 100) * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM)));
}
