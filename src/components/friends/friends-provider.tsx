"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { WorldDialog } from "@/components/worlds/world-dialog";
import { fetchAllFriends } from "@/lib/friends-client";
import type { VrchatUser } from "@/lib/vrchat/types";
import { UserDialog } from "./user-dialog";

type FriendsContextValue = {
    friends: VrchatUser[];
    allFriends: VrchatUser[];
    loading: boolean;
    error: string;
    refresh: () => Promise<void>;
    reload: () => Promise<void>;
    openUser: (userId: string) => void;
    openWorld: (worldId: string) => void;
    removeFriend: (userId: string) => void;
};

const FriendsContext = createContext<FriendsContextValue | null>(null);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
    const [friends, setFriends] = useState<VrchatUser[]>([]);
    const [allFriends, setAllFriends] = useState<VrchatUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const [selectedWorldId, setSelectedWorldId] = useState("");
    const controllerRef = useRef<AbortController | null>(null);

    const load = useCallback(async (reconcile: boolean) => {
        controllerRef.current?.abort();
        const nextController = new AbortController();
        controllerRef.current = nextController;
        setLoading(true);
        setError("");

        try {
            if (reconcile) {
                const reconciliation = await fetch("/api/monitor/reconcile", { method: "POST", signal: nextController.signal });
                if (reconciliation.status === 401) {
                    window.location.assign("/login");
                    return;
                }
                if (!reconciliation.ok) {
                    const payload = (await reconciliation.json()) as { error?: string };
                    throw new Error(payload.error || "VRChat state could not be refreshed.");
                }
            }
            const [online, offline] = await Promise.all([fetchAllFriends(false, nextController.signal), fetchAllFriends(true, nextController.signal)]);
            const onlineIds = new Set(online.map((friend) => friend.id));
            const combined = [...online, ...offline.filter((friend) => !onlineIds.has(friend.id))];
            setFriends(online);
            setAllFriends(combined);
        } catch (refreshError) {
            if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
            setError(refreshError instanceof Error ? refreshError.message : "The friend list could not be loaded.");
        } finally {
            if (!nextController.signal.aborted) setLoading(false);
        }
    }, []);
    const refresh = useCallback(() => load(true), [load]);
    const reload = useCallback(() => load(false), [load]);

    const openUser = useCallback((userId: string) => {
        setSelectedWorldId("");
        setSelectedUserId(userId);
    }, []);
    const closeUser = useCallback(() => setSelectedUserId(""), []);
    const openWorld = useCallback((worldId: string) => {
        setSelectedUserId("");
        setSelectedWorldId(worldId);
    }, []);
    const closeWorld = useCallback(() => setSelectedWorldId(""), []);
    const removeFriend = useCallback((userId: string) => {
        setFriends((current) => current.filter((friend) => friend.id !== userId));
        setAllFriends((current) => current.filter((friend) => friend.id !== userId));
    }, []);

    useEffect(() => {
        void load(false);
        // This timer only refreshes the rendered MongoDB projection. Durable
        // VRChat observation is owned by the server monitor.
        const interval = window.setInterval(() => void load(false), 30_000);
        return () => {
            window.clearInterval(interval);
            controllerRef.current?.abort();
        };
    }, [load]);

    const value = useMemo(() => ({ friends, allFriends, loading, error, refresh, reload, openUser, openWorld, removeFriend }), [friends, allFriends, loading, error, refresh, reload, openUser, openWorld, removeFriend]);
    return (
        <FriendsContext.Provider value={value}>
            {children}
            {selectedUserId ? <UserDialog userId={selectedUserId} onClose={closeUser} /> : null}
            {selectedWorldId ? <WorldDialog worldId={selectedWorldId} friends={allFriends} openUser={openUser} onClose={closeWorld} /> : null}
        </FriendsContext.Provider>
    );
}

export function useFriends() {
    const value = useContext(FriendsContext);
    if (!value) throw new Error("useFriends must be rendered inside FriendsProvider");
    return value;
}
