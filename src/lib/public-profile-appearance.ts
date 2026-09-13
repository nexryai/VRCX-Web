import type { CSSProperties } from "react";

import { safeVrchatMediaUrl } from "@/lib/browser-url";
import type { VrchatPublicProfile } from "@/lib/vrchat/types";

const themeColorLimits = { darkMinLuminance: 0.06, lightMaxLuminance: 0.74 };

// Ported from VRCX shared/constants/backgrounds.js (MIT). Only the full-size
// assets used by the read-only User Dialog presentation are needed here.
const profileBackgroundUrls: Record<string, string> = {
    grid: "BG_Grid.png",
    filigree: "BG_Cascade.png",
    "bit-mountain": "BG_GRID_BITS.png",
    approach: "BG_Approach.png",
    "planet-fall": "BG_PlanetFall.png",
    jungle: "BG_Jungle.png",
    "light-streams": "BG_LightStream.png",
    koi: "Koi_Layer.png",
    moonlight: "BG_Cloud.png",
    machine: "TechWallLayer.png",
    topology: "TOPOLOGY.png",
    circuit: "BG_Circuit.png",
    "kawaii-cupcakes": "BG_Kawaii_cupcakes.png",
    bokeh: "BG_Bokeh.png",
    hologram: "BG_Shatter.png",
    flow: "BG_Flow_Horizontal.png",
    jelly: "BG_Jelly.png",
    cheese: "BG_Cheese.png",
    alchemy: "BG_Alchemy.png",
    "sunset-mountain": "BG_MountainSun.png",
    "magic-rocks": "BG_MagicRocks.png",
    "city-stillness": "BG_FutureCityStillness.png",
    music: "BG_Music.png",
    "wolf-running": "BG_WolfRunning.png",
    "dragon-smoke": "BG_DragonSmoke.png",
    "night-rain": "BG_NightRain.png",
    "butterfly-zero": "BG_ButterFlyZERO.png",
    "i-am-speed": "void.png",
    ronin: "BG_Ronin.png",
    abduction: "BG_Abduction.png",
    "cat-dream": "BG_CatDream.png",
    "virtual-waves": "BG_VirtualWaves.png",
    "bolt-and-snail": "BG_BoltNSnail.png",
    escape: "BG_Escape.png",
};

export function readableProfileThemeColor(colorValue: string | undefined, fallback: string, isDarkMode: boolean) {
    const normalized = normalizeHex(colorValue);
    if (!normalized) return fallback;
    let rgb = hexToRgb(normalized);
    let luminance = relativeLuminance(rgb);
    const threshold = isDarkMode ? themeColorLimits.darkMinLuminance : themeColorLimits.lightMaxLuminance;
    if (isDarkMode ? luminance >= threshold : luminance <= threshold) return normalized;
    const target = isDarkMode ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    for (let index = 0; index < 14; index += 1) {
        rgb = { r: rgb.r + (target.r - rgb.r) * 0.18, g: rgb.g + (target.g - rgb.g) * 0.18, b: rgb.b + (target.b - rgb.b) * 0.18 };
        luminance = relativeLuminance(rgb);
        if (isDarkMode ? luminance >= threshold : luminance <= threshold) break;
    }
    return rgbToHex(rgb);
}

export function invertedProfileThemeColor(colorValue: string) {
    const normalized = normalizeHex(colorValue);
    if (!normalized) return colorValue;
    const rgb = hexToRgb(normalized);
    return rgbToHex({ r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b });
}

export function publicProfileBackgroundStyle(profile: VrchatPublicProfile | null, opacity: number, isDarkMode: boolean): CSSProperties {
    if (!profile) return {};
    const overlayAlpha = 1 - Math.max(0, Math.min(1, opacity));
    const overlay = isDarkMode ? `rgba(0, 0, 0, ${overlayAlpha})` : `rgba(255, 255, 255, ${overlayAlpha})`;
    const base = { backgroundClip: "padding-box" } satisfies CSSProperties;
    if (profile.backgroundType === "gradient") {
        const top = readableProfileThemeColor(profile.backgroundGradientTop, "var(--background)", isDarkMode);
        const bottom = readableProfileThemeColor(profile.backgroundGradientBottom, "var(--background)", isDarkMode);
        return { ...base, backgroundImage: `linear-gradient(${overlay}, ${overlay}), linear-gradient(180deg, ${top}, ${bottom})` };
    }
    if (profile.backgroundType === "texture" && profile.backgroundTextureId) {
        const filename = profileBackgroundUrls[profile.backgroundTextureId];
        const url = safeVrchatMediaUrl(filename ? `https://assets.vrchat.com/www/profile_decorations/profile_backgrounds/${filename}` : undefined);
        if (url) return { ...base, backgroundImage: `linear-gradient(${overlay}, ${overlay}), url("${url}")`, backgroundPosition: "top center", backgroundRepeat: "no-repeat", backgroundSize: "cover" };
    }
    return base;
}

function normalizeHex(value: string | undefined) {
    const hex = String(value || "")
        .trim()
        .replace(/^#/, "")
        .toLowerCase();
    return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

function hexToRgb(hex: string) {
    return { r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
    const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
    const channel = (value: number) =>
        Math.max(0, Math.min(255, Math.round(value)))
            .toString(16)
            .padStart(2, "0");
    return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}
