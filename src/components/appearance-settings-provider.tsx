"use client";

import { createContext, useContext, useEffect, useState } from "react";

type AppearanceSettings = {
    isAgeGatedInstancesVisible: boolean;
    showInstanceIdInLocation: boolean;
    isDataTableStriped: boolean;
    accessibleStatusIndicators: boolean;
    displayVRCPlusIconsAsAvatar: boolean;
    hideUserNotes: boolean;
    hideUserMemos: boolean;
};

const defaultAppearanceSettings: AppearanceSettings = {
    isAgeGatedInstancesVisible: false,
    showInstanceIdInLocation: false,
    isDataTableStriped: false,
    accessibleStatusIndicators: false,
    displayVRCPlusIconsAsAvatar: true,
    hideUserNotes: false,
    hideUserMemos: false,
};
const AppearanceSettingsContext = createContext<AppearanceSettings>(defaultAppearanceSettings);

export function AppearanceSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppearanceSettings>(defaultAppearanceSettings);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<Partial<AppearanceSettings>>)
            .then((value) =>
                setSettings({
                    isAgeGatedInstancesVisible: value.isAgeGatedInstancesVisible === true,
                    showInstanceIdInLocation: value.showInstanceIdInLocation === true,
                    isDataTableStriped: value.isDataTableStriped === true,
                    accessibleStatusIndicators: value.accessibleStatusIndicators === true,
                    displayVRCPlusIconsAsAvatar: value.displayVRCPlusIconsAsAvatar !== false,
                    hideUserNotes: value.hideUserNotes === true,
                    hideUserMemos: value.hideUserMemos === true,
                }),
            )
            .catch(() => undefined);
        function applySettings(event: Event) {
            const value = (event as CustomEvent<Partial<AppearanceSettings>>).detail;
            setSettings((current) => ({
                isAgeGatedInstancesVisible: value && typeof value.isAgeGatedInstancesVisible === "boolean" ? value.isAgeGatedInstancesVisible : current.isAgeGatedInstancesVisible,
                showInstanceIdInLocation: value && typeof value.showInstanceIdInLocation === "boolean" ? value.showInstanceIdInLocation : current.showInstanceIdInLocation,
                isDataTableStriped: value && typeof value.isDataTableStriped === "boolean" ? value.isDataTableStriped : current.isDataTableStriped,
                accessibleStatusIndicators: value && typeof value.accessibleStatusIndicators === "boolean" ? value.accessibleStatusIndicators : current.accessibleStatusIndicators,
                displayVRCPlusIconsAsAvatar: value && typeof value.displayVRCPlusIconsAsAvatar === "boolean" ? value.displayVRCPlusIconsAsAvatar : current.displayVRCPlusIconsAsAvatar,
                hideUserNotes: value && typeof value.hideUserNotes === "boolean" ? value.hideUserNotes : current.hideUserNotes,
                hideUserMemos: value && typeof value.hideUserMemos === "boolean" ? value.hideUserMemos : current.hideUserMemos,
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

    useEffect(() => {
        document.documentElement.classList.toggle("accessible-status-indicators", settings.accessibleStatusIndicators);
        return () => document.documentElement.classList.remove("accessible-status-indicators");
    }, [settings.accessibleStatusIndicators]);

    return <AppearanceSettingsContext.Provider value={settings}>{children}</AppearanceSettingsContext.Provider>;
}

export function useAgeGatedInstancesVisible() {
    return useContext(AppearanceSettingsContext).isAgeGatedInstancesVisible;
}

export function useShowInstanceIdInLocation() {
    return useContext(AppearanceSettingsContext).showInstanceIdInLocation;
}

export function useProfileIconsAsAvatar() {
    return useContext(AppearanceSettingsContext).displayVRCPlusIconsAsAvatar;
}

export function useUserNoteVisibility() {
    const settings = useContext(AppearanceSettingsContext);
    return { showUserNotes: !settings.hideUserNotes, showUserMemos: !settings.hideUserMemos };
}
