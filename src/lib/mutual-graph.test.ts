import { describe, expect, it } from "vitest";

import { buildMutualEdges, countMutualDegrees } from "./mutual-graph";

describe("mutual graph mapping", () => {
    it("deduplicates reciprocal relationships", () => {
        const edges = buildMutualEdges({ usr_a: ["usr_b", "usr_c"], usr_b: ["usr_a"] });
        expect(edges).toEqual([
            { source: "usr_a", target: "usr_b" },
            { source: "usr_a", target: "usr_c" },
        ]);
        expect(countMutualDegrees(edges)).toEqual(
            new Map([
                ["usr_a", 2],
                ["usr_b", 1],
                ["usr_c", 1],
            ]),
        );
    });
});
