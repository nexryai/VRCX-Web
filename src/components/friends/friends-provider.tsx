"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { VrchatUser } from "@/lib/vrchat/types";

type FriendsContextValue = {
    friends: VrchatUser[];
    loading: boolean;
    error: string;
    refresh: () => Promise<void>;
};

const FriendsContext = createContext<FriendsContextValue | null>(null);

async function fetchFriendPage(offset: number, signal: AbortSignal) {
    const response = await fetch(`/api/friends?offline=false&n=100&offset=${offset}`, {
        cache: "no-store",
        signal,
    });
    const payload = (await response.json()) as { error?: string; friends?: VrchatUser[] };
    if (response.status === 401) {
        window.location.assign("/login");
        throw new Error("The VRChat session expired.");
    }
    if (!response.ok || !payload.friends) {
        throw new Error(payload.error || "The friend list could not be loaded.");
    }
    return payload.friends;
}

export function FriendsProvider({ children }: { children: React.ReactNode }) {
    const [friends, setFriends] = useState<VrchatUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const controllerRef = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        controllerRef.current?.abort();
        const nextController = new AbortController();
        controllerRef.current = nextController;
        setLoading(true);
        setError("");

        try {
            const result: VrchatUser[] = [];
            for (let offset = 0; offset <= 7500; offset += 100) {
                const page = await fetchFriendPage(offset, nextController.signal);
                result.push(...page);
                if (page.length < 100) break;
            }
            setFriends(result);
        } catch (refreshError) {
            if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
            setError(refreshError instanceof Error ? refreshError.message : "The friend list could not be loaded.");
        } finally {
            if (!nextController.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        return () => controllerRef.current?.abort();
    }, [refresh]);

    const value = useMemo(() => ({ friends, loading, error, refresh }), [friends, loading, error, refresh]);
    return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
    const value = useContext(FriendsContext);
    if (!value) throw new Error("useFriends must be rendered inside FriendsProvider");
    return value;
}
