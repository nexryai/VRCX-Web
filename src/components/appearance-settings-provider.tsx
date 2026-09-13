"use client";

import { createContext, useContext, useEffect, useState } from "react";

type AppearanceSettings = { isAgeGatedInstancesVisible: boolean; showInstanceIdInLocation: boolean };

const AppearanceSettingsContext = createContext<AppearanceSettings>({ isAgeGatedInstancesVisible: false, showInstanceIdInLocation: false });

export function AppearanceSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppearanceSettings>({ isAgeGatedInstancesVisible: false, showInstanceIdInLocation: false });

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<Partial<AppearanceSettings>>)
            .then((value) => setSettings({ isAgeGatedInstancesVisible: value.isAgeGatedInstancesVisible === true, showInstanceIdInLocation: value.showInstanceIdInLocation === true }))
            .catch(() => undefined);
        function applySettings(event: Event) {
            const value = (event as CustomEvent<Partial<AppearanceSettings>>).detail;
            setSettings((current) => ({
                isAgeGatedInstancesVisible: value && typeof value.isAgeGatedInstancesVisible === "boolean" ? value.isAgeGatedInstancesVisible : current.isAgeGatedInstancesVisible,
                showInstanceIdInLocation: value && typeof value.showInstanceIdInLocation === "boolean" ? value.showInstanceIdInLocation : current.showInstanceIdInLocation,
            }));
        }
        window.addEventListener("vrcx:settings", applySettings);
        window.addEventListener("vrcx:settings-saved", applySettings);
        return () => {
            controller.abort();
            window.removeEventListener("vrcx:settings", applySettings);
            window.removeEventListener("vrcx:settings-saved", applySettings);
        };
    }, []);

    return <AppearanceSettingsContext.Provider value={settings}>{children}</AppearanceSettingsContext.Provider>;
}

export function useAgeGatedInstancesVisible() {
    return useContext(AppearanceSettingsContext).isAgeGatedInstancesVisible;
}

export function useShowInstanceIdInLocation() {
    return useContext(AppearanceSettingsContext).showInstanceIdInLocation;
}
