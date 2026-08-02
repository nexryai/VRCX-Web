export type WorldSearchOptions = {
    q: string;
    offset: number;
    worldLabs: "true" | "false";
    worldSortHeading: "relevance" | "featured" | "trending" | "updated" | "created" | "publication" | "shuffle" | "active" | "recent" | "favorite" | "labs" | "heat";
    worldSortOrder: "ascending" | "descending";
    worldOwnership: "any" | "mine";
    worldTag: string;
};

/** Faithful translation of VRCX's useSearchWorld parameter mapping. */
export function buildWorldSearchRequest(search: WorldSearchOptions) {
    const query: Record<string, boolean | number | string | undefined> = { n: 10, offset: search.offset, order: search.worldSortOrder };
    let endpoint = "worlds";
    if (search.worldSortHeading === "featured") {
        query.sort = "order";
        query.featured = "true";
    } else if (search.worldSortHeading === "trending") {
        query.sort = "popularity";
        query.featured = "false";
    } else if (search.worldSortHeading === "updated") query.sort = "updated";
    else if (search.worldSortHeading === "created") query.sort = "created";
    else if (search.worldSortHeading === "publication") query.sort = "publicationDate";
    else if (search.worldSortHeading === "shuffle") query.sort = "shuffle";
    else if (search.worldSortHeading === "labs") query.sort = "labsPublicationDate";
    else if (search.worldSortHeading === "heat") {
        query.sort = "heat";
        query.featured = "false";
    } else if (["active", "recent", "favorite"].includes(search.worldSortHeading)) {
        endpoint = search.worldSortHeading === "favorite" ? "worlds/favorites" : `worlds/${search.worldSortHeading}`;
    } else {
        query.sort = "relevance";
        query.search = search.q;
    }
    if (search.worldOwnership === "mine") {
        query.user = "me";
        query.releaseStatus = "all";
    }
    const approvalTag = search.worldLabs === "true" ? "" : "system_approved";
    query.tag = [search.worldTag, approvalTag].filter(Boolean).join(",") || undefined;
    return { endpoint, query };
}
