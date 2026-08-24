"use client";

import { useEffect, useRef, useState } from "react";

import type { AppSettingsPayload } from "@/lib/app-settings";
import type { BrowserNotificationDelivery } from "@/lib/browser-notifications";

const POLL_INTERVAL_MS = 5_000;

function showBrowserNotification(delivery: BrowserNotificationDelivery) {
    const toast = new Notification(delivery.title, {
        body: delivery.body,
        icon: "/vrcx.png",
        tag: delivery.tag,
    });
    toast.onclick = () => {
        window.focus();
        window.location.assign(delivery.href);
        toast.close();
    };
}

export function BrowserNotificationBridge() {
    const [enabled, setEnabled] = useState(false);
    const claiming = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((response) => response.json() as Promise<AppSettingsPayload>)
            .then((settings) => setEnabled(settings.browserNotificationsEnabled === true))
            .catch(() => undefined);

        function applySettings(event: Event) {
            const value = (event as CustomEvent<Partial<AppSettingsPayload>>).detail?.browserNotificationsEnabled;
            if (typeof value === "boolean") setEnabled(value);
        }
        window.addEventListener("vrcx:settings-saved", applySettings);
        return () => {
            controller.abort();
            window.removeEventListener("vrcx:settings-saved", applySettings);
        };
    }, []);

    useEffect(() => {
        if (!enabled || !("Notification" in window) || Notification.permission !== "granted") return;
        const controller = new AbortController();

        async function claim() {
            if (claiming.current) return;
            claiming.current = true;
            try {
                const response = await fetch("/api/browser-notifications", { method: "POST", signal: controller.signal });
                if (!response.ok) return;
                const payload = (await response.json()) as { notifications?: BrowserNotificationDelivery[] };
                for (const notification of payload.notifications || []) showBrowserNotification(notification);
            } catch {
                // Delivery is opportunistic. A later poll retries records that
                // the server did not atomically claim during this request.
            } finally {
                claiming.current = false;
            }
        }

        void claim();
        const interval = window.setInterval(() => void claim(), POLL_INTERVAL_MS);
        return () => {
            controller.abort();
            window.clearInterval(interval);
        };
    }, [enabled]);

    return null;
}
