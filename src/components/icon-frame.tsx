"use client";

import { useEffect, useRef, useState } from "react";

import { VrchatImage } from "@/components/vrchat-image";
import type { VrchatCosmeticIconFrame } from "@/lib/vrchat/types";

export function IconFrame({ frame }: { frame?: VrchatCosmeticIconFrame }) {
    const intro = frame?.metadata.assets.find((asset) => asset.type === "introAnimation");
    const main = frame?.metadata.assets.find((asset) => asset.type === "mainAnimation");
    const [introActive, setIntroActive] = useState(Boolean(intro));
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        clearTimeout(timerRef.current);
        setIntroActive(Boolean(intro));
        return () => clearTimeout(timerRef.current);
    }, [intro]);

    if (!intro && !main) return null;

    return (
        <span data-icon-frame={frame?.id} aria-hidden="true">
            {main ? <VrchatImage src={main.url} alt="" className={`pointer-events-none absolute -top-[15%] -left-[15%] h-[130%] w-[130%] max-w-none ${introActive ? "hidden" : ""}`} /> : null}
            {intro ? (
                <VrchatImage
                    src={intro.url}
                    alt=""
                    onLoad={() => {
                        clearTimeout(timerRef.current);
                        timerRef.current = setTimeout(() => setIntroActive(false), intro.totalDurationMs ?? 0);
                    }}
                    className={`pointer-events-none absolute -top-[15%] -left-[15%] h-[130%] w-[130%] max-w-none ${introActive ? "" : "hidden"}`}
                />
            ) : null}
        </span>
    );
}
