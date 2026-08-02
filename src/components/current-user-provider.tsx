"use client";

import { createContext, useContext } from "react";

import type { VrchatUser } from "@/lib/vrchat/types";

const CurrentUserContext = createContext<VrchatUser | null>(null);

export function CurrentUserProvider({ user, children }: { user: VrchatUser; children: React.ReactNode }) {
    return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
    const user = useContext(CurrentUserContext);
    if (!user) throw new Error("useCurrentUser must be rendered inside CurrentUserProvider");
    return user;
}
