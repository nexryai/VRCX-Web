export type MutualGraphSnapshot = {
    updatedAt: string;
    relationships: Record<string, string[]>;
    optedOut: string[];
};

export type MutualEdge = { source: string; target: string };

export function buildMutualEdges(relationships: Record<string, string[]>) {
    const seen = new Set<string>();
    const edges: MutualEdge[] = [];
    for (const [source, targets] of Object.entries(relationships)) {
        for (const target of targets) {
            if (!source || !target || source === target) continue;
            const key = source < target ? `${source}:${target}` : `${target}:${source}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({ source, target });
        }
    }
    return edges;
}

export function countMutualDegrees(edges: MutualEdge[]) {
    const degrees = new Map<string, number>();
    for (const edge of edges) {
        degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
        degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }
    return degrees;
}
