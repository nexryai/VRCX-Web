"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchAllFriends } from "@/lib/friends-client";
import type { VrchatUser } from "@/lib/vrchat/types";
import { UserDialog } from "./user-dialog";

type FriendsContextValue = {
    friends: VrchatUser[];
    loading: boolean;
    error: string;
    refresh: () => Promise<void>;
    openUser: (userId: string) => void;
    removeFriend: (userId: string) => void;
};

const FriendsContext = createContext<FriendsContextValue | null>(null);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
    const [friends, setFriends] = useState<VrchatUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const controllerRef = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        controllerRef.current?.abort();
        const nextController = new AbortController();
        controllerRef.current = nextController;
        setLoading(true);
        setError("");

        try {
            const result = await fetchAllFriends(false, nextController.signal);
            setFriends(result);
        } catch (refreshError) {
            if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
            setError(refreshError instanceof Error ? refreshError.message : "The friend list could not be loaded.");
        } finally {
            if (!nextController.signal.aborted) setLoading(false);
        }
    }, []);

    const openUser = useCallback((userId: string) => setSelectedUserId(userId), []);
    const closeUser = useCallback(() => setSelectedUserId(""), []);
    const removeFriend = useCallback((userId: string) => setFriends((current) => current.filter((friend) => friend.id !== userId)), []);

    useEffect(() => {
        void refresh();
        return () => controllerRef.current?.abort();
    }, [refresh]);

    const value = useMemo(() => ({ friends, loading, error, refresh, openUser, removeFriend }), [friends, loading, error, refresh, openUser, removeFriend]);
    return (
        <FriendsContext.Provider value={value}>
            {children}
            {selectedUserId ? <UserDialog userId={selectedUserId} onClose={closeUser} /> : null}
        </FriendsContext.Provider>
    );
}

export function useFriends() {
    const value = useContext(FriendsContext);
    if (!value) throw new Error("useFriends must be rendered inside FriendsProvider");
    return value;
}
