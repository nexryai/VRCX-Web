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
    hideNicknames: boolean;
    dtHour12: boolean;
    dtIsoFormat: boolean;
    weekStartsOn: 0 | 1 | 6;
    theme: "dark" | "light";
    displayVRCProfileThemes: boolean;
    displayVRCProfileBackgrounds: boolean;
    profileBackgroundOpacity: number;
};

const defaultAppearanceSettings: AppearanceSettings = {
    isAgeGatedInstancesVisible: false,
    showInstanceIdInLocation: false,
    isDataTableStriped: false,
    accessibleStatusIndicators: false,
    displayVRCPlusIconsAsAvatar: true,
    hideUserNotes: false,
    hideUserMemos: false,
    hideNicknames: false,
    dtHour12: false,
    dtIsoFormat: false,
    weekStartsOn: 1,
    theme: "dark",
    displayVRCProfileThemes: true,
    displayVRCProfileBackgrounds: false,
    profileBackgroundOpacity: 0.5,
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
                    hideNicknames: value.hideNicknames === true,
                    dtHour12: value.dtHour12 === true,
                    dtIsoFormat: value.dtIsoFormat === true,
                    weekStartsOn: value.weekStartsOn === 0 || value.weekStartsOn === 6 ? value.weekStartsOn : 1,
                    theme: value.theme === "light" ? "light" : "dark",
                    displayVRCProfileThemes: value.displayVRCProfileThemes !== false,
                    displayVRCProfileBackgrounds: value.displayVRCProfileBackgrounds === true,
                    profileBackgroundOpacity: typeof value.profileBackgroundOpacity === "number" ? value.profileBackgroundOpacity : 0.5,
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
                hideNicknames: value && typeof value.hideNicknames === "boolean" ? value.hideNicknames : current.hideNicknames,
                dtHour12: value && typeof value.dtHour12 === "boolean" ? value.dtHour12 : current.dtHour12,
                dtIsoFormat: value && typeof value.dtIsoFormat === "boolean" ? value.dtIsoFormat : current.dtIsoFormat,
                weekStartsOn: value && (value.weekStartsOn === 0 || value.weekStartsOn === 1 || value.weekStartsOn === 6) ? value.weekStartsOn : current.weekStartsOn,
                theme: value?.theme === "dark" || value?.theme === "light" ? value.theme : current.theme,
                displayVRCProfileThemes: value && typeof value.displayVRCProfileThemes === "boolean" ? value.displayVRCProfileThemes : current.displayVRCProfileThemes,
                displayVRCProfileBackgrounds: value && typeof value.displayVRCProfileBackgrounds === "boolean" ? value.displayVRCProfileBackgrounds : current.displayVRCProfileBackgrounds,
                profileBackgroundOpacity: value && typeof value.profileBackgroundOpacity === "number" ? value.profileBackgroundOpacity : current.profileBackgroundOpacity,
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

export function useMemoNicknamesVisible() {
    return !useContext(AppearanceSettingsContext).hideNicknames;
}

export function useDateTimeSettings() {
    const settings = useContext(AppearanceSettingsContext);
    return { hour12: settings.dtHour12, iso: settings.dtIsoFormat, weekStartsOn: settings.weekStartsOn };
}

export function usePublicProfileAppearance() {
    const settings = useContext(AppearanceSettingsContext);
    return {
        showThemes: settings.displayVRCProfileThemes,
        showBackgrounds: settings.displayVRCProfileBackgrounds,
        backgroundOpacity: settings.profileBackgroundOpacity,
        isDarkMode: settings.theme === "dark",
    };
}
