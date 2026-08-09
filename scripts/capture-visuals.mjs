import { chromium } from "@playwright/test";

import { mkdir } from "node:fs/promises";

const port = process.env.VRCX_VISUAL_PORT || "3210";
const output = ".visual";
const executablePath = process.env.VRCX_PLAYWRIGHT_EXECUTABLE;
await mkdir(output, { recursive: true });

const captures = [
    { name: "friends-locations", path: "/friends-locations", readyText: "Aoi Sample" },
    { name: "feed", path: "/feed", readyText: "Own status is now recorded" },
    { name: "friend-log", path: "/social/friend-log", readyText: "Former Friend" },
    { name: "friend-list", path: "/social/friend-list", readyText: "Known User" },
    { name: "friend-list-note-search", path: "/social/friend-list", readyText: "Aoi Sample", friendListSearch: { field: "Note", query: "world-building meetup" } },
    { name: "friend-list-memo-search", path: "/social/friend-list", readyText: "Aoi Sample", friendListSearch: { field: "Memo", query: "browser-port test crew" } },
    { name: "user-dialog", path: "/social/friend-list", readyText: "Current instance", clickText: "Aoi Sample" },
    { name: "previous-instances-user", path: "/social/friend-list", readyText: "Remote user", clickText: "Aoi Sample", previousInstances: "user" },
    { name: "user-favorite-dialog", path: "/social/friend-list", readyText: "VRChat Favorites", clickText: "Aoi Sample", favoriteKind: "friend", favoriteActionLabel: "Manage favorites for Aoi Sample" },
    { name: "notifications", path: "/notification", readyText: "Group announcement, Community meetup starts in one hour." },
    { name: "game-log", path: "/game-log", readyText: "Visual Operator: join me · Own status is now recorded" },
    { name: "search", path: "/search", readyText: "Found through the VRChat user search.", searchQuery: "sample creator" },
    { name: "favorite-friends", path: "/favorites/friends", readyText: "Building a new world", favoriteKind: "friend" },
    { name: "favorite-friends-import", path: "/favorites/friends", readyText: "Import favorite friends", favoriteKind: "friend", favoriteDialog: "Import" },
    { name: "favorite-friends-export", path: "/favorites/friends", readyText: "Export favorite friends", favoriteKind: "friend", favoriteDialog: "Export" },
    { name: "favorite-worlds", path: "/favorites/worlds", readyText: "Favorite World Author (24)", favoriteKind: "world" },
    { name: "world-dialog", path: "/favorites/worlds", readyText: "World ID", favoriteKind: "world", worldDialog: true },
    { name: "previous-instances-world", path: "/favorites/worlds", readyText: "You", favoriteKind: "world", worldDialog: true, previousInstances: "world" },
    { name: "world-favorite-dialog", path: "/favorites/worlds", readyText: "VRChat Favorites", favoriteKind: "world", worldDialog: true, favoriteActionLabel: "Manage favorites for Favorite Moonlit World" },
    { name: "group-dialog", path: "/friends-locations", readyText: "Remote Group Lounge", groupDialog: true },
    { name: "previous-instances-group", path: "/friends-locations", readyText: "You", groupDialog: true, previousInstances: "group" },
    { name: "group-dialog-posts", path: "/friends-locations", readyText: "Community meetup", groupDialog: true, groupTab: "Posts" },
    { name: "group-dialog-members", path: "/friends-locations", readyText: "Group Host Sample", groupDialog: true, groupTab: "Members" },
    { name: "favorite-avatars", path: "/favorites/avatars", readyText: "Avatar Artist", favoriteKind: "avatar" },
    { name: "avatar-dialog", path: "/favorites/avatars", readyText: "Avatar ID", favoriteKind: "avatar", avatarDialog: true },
    { name: "avatar-favorite-dialog", path: "/favorites/avatars", readyText: "VRChat Favorites", favoriteKind: "avatar", avatarDialog: true, favoriteActionLabel: "Manage favorites for Favorite Browser Avatar" },
    { name: "moderation", path: "/social/moderation", readyText: "Moderated Cobalt User" },
    { name: "my-avatars", path: "/my-avatars", readyText: "Dance", avatars: true },
    { name: "mutual-friends", path: "/charts/mutual", readyText: "Aoi Sample" },
    { name: "hot-worlds", path: "/charts/hot-worlds", readyText: "Sorted by unique friends" },
    { name: "hot-worlds-detail", path: "/charts/hot-worlds", readyText: "Friends who visited", hotWorldDetail: true },
    { name: "settings", path: "/settings", readyText: "Application data" },
    { name: "settings-avatar-purge", path: "/settings", readyText: "This action cannot be undone.", avatarPurgeDialog: true },
    { name: "settings-interface", path: "/settings", readyText: "Sort favorites by", clickText: "Interface" },
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
const requestedWidths = (process.env.VRCX_VISUAL_WIDTHS || "").split(",").filter(Boolean).map(Number);
const widths = requestedWidths.length ? requestedWidths : [360, 768, 1280, 1920];
if (widths.some((width) => !Number.isInteger(width) || width < 320 || width > 3840)) throw new Error("VRCX_VISUAL_WIDTHS must contain comma-separated viewport widths from 320 through 3840.");

for (const width of widths) {
    for (const capture of selectedCaptures) {
        // A fresh browser per capture avoids native Chromium resource leakage in
        // minimal CI containers while keeping each screenshot deterministic.
        const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
        // Groups live in VRCX's desktop friends sidebar. Open the selected group
        // before resizing so the dialog itself can still be verified at narrow widths.
        const navigationWidth = capture.groupDialog && width < 1280 ? 1280 : width;
        const page = await browser.newPage({ viewport: { width: navigationWidth, height: 800 }, deviceScaleFactor: 1 });
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
        if (capture.previousInstances) {
            if (capture.previousInstances === "user") {
                await page.route("**/api/favorites?section=limits", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ limits: { maxFavoriteGroups: { friend: 3 }, maxFavoritesPerGroup: { friend: 150 } } }) }));
                await page.route("**/api/local-favorites?kind=friend", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ groups: [], items: [] }) }));
            }
        }
        await page.goto(`http://localhost:${port}${capture.path}`, { waitUntil: "domcontentloaded" });
        if (capture.friendListSearch) {
            const filterSummary = page.getByText("Filter fields", { exact: true });
            await filterSummary.click();
            await page.getByLabel(capture.friendListSearch.field, { exact: true }).check();
            await filterSummary.click();
            await page.getByPlaceholder("Search friends", { exact: true }).fill(capture.friendListSearch.query);
        }
        if (capture.favoriteDialog) {
            await page.getByLabel("Favorite card settings").click();
            await page.getByRole("button", { name: capture.favoriteDialog, exact: true }).click();
        }
        if (capture.avatarPurgeDialog) {
            const purgeButton = page.getByRole("button", { name: "Purge", exact: true });
            await purgeButton.click();
            await page.getByRole("dialog", { name: "Purge Avatar Feed Data" }).waitFor();
            await page.keyboard.press("Escape");
            await page.getByRole("dialog", { name: "Purge Avatar Feed Data" }).waitFor({ state: "detached" });
            if (!(await purgeButton.evaluate((element) => document.activeElement === element))) throw new Error("Avatar purge dialog did not restore focus after Escape.");
            await purgeButton.click();
        }
        if (capture.worldDialog) {
            await page.getByText("Favorite Moonlit World", { exact: true }).first().click();
        }
        if (capture.groupDialog) {
            // Waiting for the count prevents the persisted sidebar setting from
            // racing this click while its initial request is still resolving.
            await page.getByRole("tab", { name: /^Groups\s+1$/ }).click();
            await page.getByText("VRCX Test Group", { exact: true }).first().click();
            if (capture.groupTab) await page.getByRole("tab", { name: capture.groupTab, exact: true }).click();
            if (navigationWidth !== width) await page.setViewportSize({ width, height: 800 });
        }
        if (capture.avatarDialog) {
            await page.getByText("Favorite Browser Avatar", { exact: true }).first().click();
        }
        if (capture.clickText) {
            await page.getByText(capture.clickText, { exact: true }).first().click();
        }
        if (capture.previousInstances) {
            const trigger = page.getByRole("button", { name: "Previous Instances", exact: true });
            await trigger.click();
            const dialog = page.getByRole("dialog", { name: "Previous Instances", exact: true });
            await dialog.waitFor();
            await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "detached" });
            if (!(await trigger.evaluate((element) => document.activeElement === element))) throw new Error("Previous Instances did not restore focus after Escape.");
            await trigger.click();
        }
        if (capture.hotWorldDetail) {
            const trigger = page.getByRole("button", { name: "Show visit details for The Great Pug", exact: true }).first();
            await trigger.click();
            const dialog = page.getByRole("dialog", { name: "The Great Pug", exact: true });
            await dialog.waitFor();
            await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "detached" });
            if (!(await trigger.evaluate((element) => document.activeElement === element))) throw new Error("Hot Worlds detail did not restore focus after Escape.");
            await trigger.click();
        }
        if (capture.favoriteActionLabel) {
            await page.getByRole("button", { name: capture.favoriteActionLabel, exact: true }).click();
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
