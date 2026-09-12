"use client";

import { createContext, useContext, useEffect, useState } from "react";

const AgeGatedInstancesContext = createContext(false);

export function AppearanceSettingsProvider({ children }: { children: React.ReactNode }) {
    const [showAgeGatedInstances, setShowAgeGatedInstances] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<{ isAgeGatedInstancesVisible?: boolean }>)
            .then((settings) => setShowAgeGatedInstances(settings.isAgeGatedInstancesVisible === true))
            .catch(() => undefined);
        function applySettings(event: Event) {
            const value = (event as CustomEvent<{ isAgeGatedInstancesVisible?: boolean }>).detail?.isAgeGatedInstancesVisible;
            if (typeof value === "boolean") setShowAgeGatedInstances(value);
        }
        window.addEventListener("vrcx:settings", applySettings);
        window.addEventListener("vrcx:settings-saved", applySettings);
        return () => {
            controller.abort();
            window.removeEventListener("vrcx:settings", applySettings);
            window.removeEventListener("vrcx:settings-saved", applySettings);
        };
    }, []);

    return <AgeGatedInstancesContext.Provider value={showAgeGatedInstances}>{children}</AgeGatedInstancesContext.Provider>;
}

export function useAgeGatedInstancesVisible() {
    return useContext(AgeGatedInstancesContext);
}
