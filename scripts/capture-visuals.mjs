import { chromium } from "@playwright/test";

import { mkdir } from "node:fs/promises";

const port = process.env.VRCX_VISUAL_PORT || "3210";
const output = ".visual";
const executablePath = process.env.VRCX_PLAYWRIGHT_EXECUTABLE;
await mkdir(output, { recursive: true });

const captures = [
    { name: "friends-locations", path: "/", readyText: "Aoi Sample" },
    { name: "feed", path: "/feed", readyText: "Moved to wrld_00000000-0000-0000-0000-000000000010:12345" },
    { name: "friend-log", path: "/social/friend-log", readyText: "Former Friend" },
    { name: "friend-list", path: "/social/friend-list", readyText: "Known User" },
    { name: "user-dialog", path: "/social/friend-list", readyText: "Current instance", clickText: "Aoi Sample" },
    { name: "notifications", path: "/notification", readyText: "Group announcement, Community meetup starts in one hour." },
    { name: "game-log", path: "/game-log", readyText: "Midnight Rooftop" },
    { name: "search", path: "/search", readyText: "Found through the VRChat user search.", searchQuery: "sample creator" },
    { name: "favorite-friends", path: "/favorite/friends", readyText: "Building a new world", favoriteKind: "friend" },
    { name: "favorite-worlds", path: "/favorite/worlds", readyText: "Favorite World Author (24)", favoriteKind: "world" },
    { name: "favorite-avatars", path: "/favorite/avatars", readyText: "Avatar Artist", favoriteKind: "avatar" },
    { name: "moderation", path: "/social/moderation", readyText: "Moderated Cobalt User" },
    { name: "my-avatars", path: "/avatars", readyText: "Dance", avatars: true },
];

const searchFixture = [
    {
        id: "usr_00000000-0000-0000-0000-000000000031",
        displayName: "Search Result Creator",
        bio: "Found through the VRChat user search.",
        currentAvatarThumbnailImageUrl: "",
        tags: ["system_trust_trusted", "language_eng", "language_jpn"],
    },
    {
        id: "usr_00000000-0000-0000-0000-000000000032",
        displayName: "World Builder",
        bio: "Public profile returned by the remote API.",
        tags: ["system_trust_known", "language_eng"],
    },
];
const requestedCaptures = new Set((process.env.VRCX_VISUAL_ONLY || "").split(",").filter(Boolean));
const selectedCaptures = requestedCaptures.size ? captures.filter((capture) => requestedCaptures.has(capture.name)) : captures;

for (const width of [360, 768, 1280, 1920]) {
    for (const capture of selectedCaptures) {
        // A fresh browser per capture avoids native Chromium resource leakage in
        // minimal CI containers while keeping each screenshot deterministic.
        const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
        const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
        page.setDefaultNavigationTimeout(60_000);
        if (capture.searchQuery) {
            await page.route("**/api/search/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ worldRows: [{ index: 0, name: "Featured", sortHeading: "featured" }] }) }));
            await page.route("**/api/search?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ type: "users", results: searchFixture, offset: 0, pageSize: 10 }) }));
        }
        if (capture.favoriteKind) {
            await page.route("**/api/favorites?section=limits", (route) =>
                route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ limits: { maxFavoriteGroups: { avatar: 6, friend: 3, vrcPlusWorld: 4, world: 4 }, maxFavoritesPerGroup: { avatar: 50, friend: 150, vrcPlusWorld: 100, world: 100 } } }) }),
            );
            if (capture.favoriteKind !== "friend") {
                const items =
                    capture.favoriteKind === "world"
                        ? [{ id: "wrld_00000000-0000-0000-0000-000000000051", name: "Favorite Moonlit World", authorName: "Favorite World Author", occupants: 24 }]
                        : [{ id: "avtr_00000000-0000-0000-0000-000000000052", name: "Favorite Browser Avatar", authorName: "Avatar Artist", releaseStatus: "public" }];
                await page.route(`**/api/favorites?section=items&type=${capture.favoriteKind}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) }));
            }
        }
        if (capture.avatars) {
            await page.route("**/api/avatars?offset=*", (route) => {
                const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
                const avatars =
                    offset === 0
                        ? [
                              {
                                  id: "avtr_00000000-0000-0000-0000-000000000061",
                                  name: "Browser Dance Avatar",
                                  description: "Responsive avatar fixture",
                                  releaseStatus: "public",
                                  version: 12,
                                  created_at: "2026-02-03T12:00:00.000Z",
                                  updated_at: "2026-07-31T12:00:00.000Z",
                                  unityPackages: [
                                      { platform: "standalonewindows", performanceRating: "Good" },
                                      { platform: "android", performanceRating: "Medium" },
                                  ],
                              },
                              {
                                  id: "avtr_00000000-0000-0000-0000-000000000062",
                                  name: "Private Builder Avatar",
                                  description: "Private test avatar",
                                  releaseStatus: "private",
                                  version: 4,
                                  created_at: "2026-05-04T12:00:00.000Z",
                                  updated_at: "2026-07-25T12:00:00.000Z",
                                  unityPackages: [
                                      { platform: "standalonewindows", performanceRating: "Excellent" },
                                      { platform: "ios", performanceRating: "Poor" },
                                  ],
                              },
                          ]
                        : [];
                return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ avatars }) });
            });
        }
        await page.goto(`http://localhost:${port}${capture.path}`, { waitUntil: "domcontentloaded" });
        if (capture.clickText) {
            await page.getByText(capture.clickText, { exact: true }).first().click();
        }
        if (capture.searchQuery) {
            await page.getByRole("searchbox", { name: "Search users" }).fill(capture.searchQuery);
            await page.getByRole("searchbox", { name: "Search users" }).press("Enter");
        }
        await page.getByText(capture.readyText, { exact: true }).first().waitFor({ state: "attached" });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${output}/${capture.name}-${width}.png`, fullPage: true });
        const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
        await browser.close();
        if (overflow.width > overflow.viewport) {
            throw new Error(`${capture.name} has page-level horizontal overflow: ${overflow.width}px > ${overflow.viewport}px`);
        }
    }
}
