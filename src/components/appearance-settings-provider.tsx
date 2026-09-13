"use client";

import { createContext, useContext, useEffect, useState } from "react";

type AppearanceSettings = { isAgeGatedInstancesVisible: boolean; showInstanceIdInLocation: boolean; isDataTableStriped: boolean };

const defaultAppearanceSettings: AppearanceSettings = { isAgeGatedInstancesVisible: false, showInstanceIdInLocation: false, isDataTableStriped: false };
const AppearanceSettingsContext = createContext<AppearanceSettings>(defaultAppearanceSettings);

export function AppearanceSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppearanceSettings>(defaultAppearanceSettings);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<Partial<AppearanceSettings>>)
            .then((value) => setSettings({ isAgeGatedInstancesVisible: value.isAgeGatedInstancesVisible === true, showInstanceIdInLocation: value.showInstanceIdInLocation === true, isDataTableStriped: value.isDataTableStriped === true }))
            .catch(() => undefined);
        function applySettings(event: Event) {
            const value = (event as CustomEvent<Partial<AppearanceSettings>>).detail;
            setSettings((current) => ({
                isAgeGatedInstancesVisible: value && typeof value.isAgeGatedInstancesVisible === "boolean" ? value.isAgeGatedInstancesVisible : current.isAgeGatedInstancesVisible,
                showInstanceIdInLocation: value && typeof value.showInstanceIdInLocation === "boolean" ? value.showInstanceIdInLocation : current.showInstanceIdInLocation,
                isDataTableStriped: value && typeof value.isDataTableStriped === "boolean" ? value.isDataTableStriped : current.isDataTableStriped,
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

    useEffect(() => {
        document.documentElement.dataset.tableStriped = String(settings.isDataTableStriped);
        return () => {
            delete document.documentElement.dataset.tableStriped;
        };
    }, [settings.isDataTableStriped]);

    return <AppearanceSettingsContext.Provider value={settings}>{children}</AppearanceSettingsContext.Provider>;
}

export function useAgeGatedInstancesVisible() {
    return useContext(AppearanceSettingsContext).isAgeGatedInstancesVisible;
}

export function useShowInstanceIdInLocation() {
    return useContext(AppearanceSettingsContext).showInstanceIdInLocation;
}
