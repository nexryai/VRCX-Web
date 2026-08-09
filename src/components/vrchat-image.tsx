import type { ImgHTMLAttributes, ReactNode, SVGProps } from "react";

import { safeVrchatMediaUrl } from "@/lib/browser-url";

type VrchatImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    src?: string | null;
    fallback?: ReactNode;
};

export function VrchatImage({ src, fallback = null, ...props }: VrchatImageProps) {
    const safeSource = safeVrchatMediaUrl(src);
    return safeSource ? <img {...props} src={safeSource} /> : fallback;
}

type VrchatSvgImageProps = Omit<SVGProps<SVGImageElement>, "href"> & {
    src?: string | null;
};

export function VrchatSvgImage({ src, ...props }: VrchatSvgImageProps) {
    const safeSource = safeVrchatMediaUrl(src);
    return safeSource ? <image {...props} href={safeSource} /> : null;
}
