import { describe, expect, test } from "vitest";

import { buildWorldSearchRequest, type WorldSearchOptions } from "./search";

const defaults: WorldSearchOptions = {
    q: "home world",
    offset: 0,
    worldLabs: "false",
    worldSortHeading: "relevance",
    worldSortOrder: "descending",
    worldOwnership: "any",
    worldTag: "",
};

describe("VRCX world search mapping", () => {
    test("adds the approved-world tag to a relevance search", () => {
        expect(buildWorldSearchRequest(defaults)).toEqual({
            endpoint: "worlds",
            query: { n: 10, offset: 0, order: "descending", search: "home world", sort: "relevance", tag: "system_approved" },
        });
    });

    test("maps dynamic categories and ownership without dropping their tag", () => {
        expect(buildWorldSearchRequest({ ...defaults, offset: 20, worldSortHeading: "featured", worldSortOrder: "ascending", worldOwnership: "mine", worldTag: "party" })).toEqual({
            endpoint: "worlds",
            query: { n: 10, offset: 20, order: "ascending", sort: "order", featured: "true", user: "me", releaseStatus: "all", tag: "party,system_approved" },
        });
    });

    test("uses the dedicated remote endpoint and permits Community Labs", () => {
        expect(buildWorldSearchRequest({ ...defaults, worldLabs: "true", worldSortHeading: "recent" })).toEqual({
            endpoint: "worlds/recent",
            query: { n: 10, offset: 0, order: "descending", tag: undefined },
        });
    });
});
