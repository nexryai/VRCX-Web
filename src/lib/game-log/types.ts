export type GameSessionActivityType = "Avatar" | "Bio" | "GPS" | "Offline" | "Online" | "Status";

export type GameSessionActivityDto = {
    id: string;
    type: GameSessionActivityType;
    displayName: string;
    occurredAt: string;
    previous?: string;
    current?: string;
    provenance: "pipeline" | "reconciliation";
};

export type GameSessionDto = {
    id: string;
    location: string;
    worldId?: string;
    instanceId?: string;
    worldName?: string;
    groupId?: string;
    groupName?: string;
    startedAt: string;
    endedAt?: string;
    startPrecision: "upstream" | "observed";
    startSource: "pipeline" | "reconciliation";
    endPrecision?: "upstream" | "observed";
    endSource?: "pipeline" | "reconciliation";
    firstObservedAt: string;
    lastObservedAt: string;
    current: boolean;
    activities: GameSessionActivityDto[];
};

export type GameSessionsResponse = {
    sessions: GameSessionDto[];
    nextCursor?: string;
};
