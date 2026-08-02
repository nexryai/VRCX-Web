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
};

export type GameSessionsResponse = {
    sessions: GameSessionDto[];
    nextCursor?: string;
};
