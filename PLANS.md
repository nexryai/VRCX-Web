# VRCX Next.js Port Plan

## Purpose

This is the living plan and decision log for a local-first, single-user VRCX port built with Next.js. The product should look and behave like VRCX for every feature that can be implemented from remote VRChat APIs, server-derived history, MongoDB, and standard browser capabilities.

The Next.js server is an always-on application process, not merely a page renderer. It owns the VRChat session, realtime Pipeline connection, scheduled HTTP reconciliation, durable event processing, and MongoDB persistence. Monitoring must continue while no browser is connected.

## Changed Direction

The earlier root prototype treated this as a browser-session application: it omitted all local-derived areas, refreshed friends from an open page, and stored several histories and preferences in browser storage. That approach is superseded.

The accepted direction is now:

- keep excluding behavior that truly requires a locally installed or running VRChat client;
- recover as much VRCX behavior as possible from continuous server-side VRChat HTTP and realtime API observation;
- include Game Log as a remote-derived feature, limited to VRCX's session presentation and every session field the APIs can support;
- exclude Dashboard completely, including its route, navigation, widgets, data jobs, and settings;
- store all durable application data in MongoDB rather than browser storage or SQLite;
- support exactly one operator and one active VRChat identity;
- reproduce VRCX's UI instead of retaining the current root prototype's differing web design.

Existing root features are useful API and domain prototypes, but no feature is considered parity-complete until it meets the new monitoring, MongoDB, and visual acceptance criteria.

## Product Constraints

- `./VRCX/` is the read-only implementation, behavior, and visual reference. The root application must run independently of that checkout.
- VRCX UI parity is the default. Every visible difference needs a browser, accessibility, security, or excluded-feature justification.
- The deployment is a long-lived Node.js service on a trusted private network with access to MongoDB and the VRChat remote services.
- The server monitors one VRChat identity continuously. It does not require a browser tab to remain open.
- MongoDB is the authoritative store for all durable settings, observations, histories, caches, preferences, synchronization state, and retained session state.
- No application accounts, roles, tenants, or authorization system will be added. VRChat authentication remains required and server-scoped.
- Local VRChat installation/process/log/filesystem, Steam, OpenVR, Electron, Windows API, IPC, registry, local OSC, and tray/window integration remain out of scope.
- Documentation, code comments, and Git messages are written in English.

## Target Runtime Architecture

```text
VRChat HTTP API ---- reconciliation/snapshots ----+
                                                  |
VRChat Pipeline ---- realtime events ------------>+-- Monitor/ingestion service -- MongoDB
                                                  |          |                   |
Scheduled jobs ------ refresh/repair/retention -->+          |                   |
                                                             v                   v
Browser <------ VRCX-parity React UI <------ Next.js routes/server actions <--- queries
```

### Process Model

- Run Next.js in a persistent Node.js environment. A request-only or scale-to-zero serverless deployment is unsupported.
- Run one logical monitor leader. If the deployment has multiple Node.js processes, use a MongoDB-backed lease with expiry and renewal to prevent duplicate Pipeline connections and jobs.
- Start monitoring after a stored session is validated. Authentication-required state is durable and visible to the operator.
- Keep interactive API requests and background synchronization behind the same typed, allowlisted VRChat client and coordinated rate-limit budget.
- Validate entity identifiers with the shared canonical VRChat prefix/UUID schemas. Dynamic route parameters, JSON bodies, stored setting IDs, Game Log location/group parsing, and every variable upstream allowlist path reject missing, repeated, misplaced, or trailing separators before a request can leave the server.

### Observation Model

- Use the VRChat Pipeline WebSocket for prompt friend presence, relationship, notification, and other supported events.
- Use paginated HTTP snapshots at startup and on a schedule to establish baselines and repair gaps because the Pipeline is not a durable event queue.
- After disconnect or process restart, validate the session, reconcile current remote state, derive any safely inferable changes, and reconnect.
- Persist both upstream occurrence time, when available, and ingestion time. Mark events derived from snapshot differences so the UI does not imply unavailable precision.
- Deduplicate with upstream IDs or deterministic keys. Event handling and reconciliation must be safe to retry.
- The Pipeline does not expose a replayable durable cursor. Persist a local commit sequence, event type, payload hash, and observation time only after normalized writes succeed; after every reconnect, use the HTTP snapshot reconciliation path to repair the uncommitted gap rather than claiming stream replay.
- Write friend-history transitions before advancing their current-state projection. Derive their deterministic keys from the active identity, transition values, and prior projection version or relationship epoch so Pipeline delivery, reconciliation, and crash retries converge on one event.
- Expose connection, last-event, last-reconciliation, rate-limit, and authentication health in the VRCX-equivalent status surface.

### MongoDB Model

Collection names are provisional until each VRCX storage path is traced, but the logical groups are fixed:

| Logical collection | Responsibility | Important indexes/invariants |
| --- | --- | --- |
| `app_settings` | Singleton VRCX settings, appearance, language, navigation, and retention configuration | Unique singleton key |
| `vrchat_session` | One encrypted restart-persistent VRChat session when enabled | Unique singleton key; never return session material to clients |
| `monitor_state` | Leader lease, cursors, baselines, health, reconciliation timestamps, and rate-limit state | Unique singleton/stream keys; lease expiry index |
| `users` | Cached current user, friends, and remotely observed user profiles | Unique VRChat user ID; freshness index |
| `worlds`, `groups`, `avatars` | Remote object caches used by VRCX workflows | Unique upstream ID; freshness/updated indexes |
| `friend_snapshots` | Current authoritative remote-observable friend state | Unique friend ID for the single active identity |
| `self_snapshots` | Current remote-observable state of the active VRChat identity used as the self-activity diff baseline | Unique owner ID; never mixed into the friend projection |
| `game_sessions` | API-observed location sessions for the active account, including bounded/current state and observation provenance | Unique deterministic session key; start/end, location, and current-session indexes; at most one open session |
| `activity_events` | Feed, Friend Log, presence, status, location, avatar, bio, and relationship history | Unique idempotency key; subject/time and type/time indexes |
| `notifications` | Legacy and V2 notification state and history | Unique upstream notification ID; created/seen indexes |
| `favorites`, `favorite_groups` | Current and retained VRChat favorite records plus remote group metadata | Unique owner/record and owner/group keys |
| `local_favorite_groups`, `local_favorites` | MongoDB-native VRCX local groups and cached user/world/avatar membership snapshots | Unique owner/kind/normalized-name and owner/group/object keys |
| `memos`, `avatar_tags` | User/world/avatar memos and avatar tagging | Unique target or target/tag keys |
| `avatar_style_snapshots` | Complete VRChat avatar-style option snapshot used by owned-avatar editing | Unique owner and observation-time indexes |
| `moderations` | Remotely visible moderation snapshots/history | Unique subject/type key; updated index |
| `mutual_graph` | Last complete mutual-friend snapshot plus durable fetch status, progress, cancellation, target, and heartbeat | Unique active-owner document and job ID |
| `jobs` | Restart-safe backfills, migrations, imports, and long-running fetch state | Unique job key; status/updated index |

Detailed schemas, retention, and VRCX SQLite/JSON mappings must be added before implementing each repository. MongoDB migrations must be versioned, idempotent, and restart-safe.

Whole-database recovery is an operator workflow and is deliberately separate from the browser-safe Settings preference export. `pnpm mongodb:backup-smoke` uses MongoDB Database Tools through a protected temporary configuration file, rejects a changing source snapshot, restores only into a generated isolated namespace, fingerprints documents, collection options, and indexes, verifies retained-session decryptability, and removes its temporary database and archive. A retained production archive and its matching `VRCHAT_SESSION_ENCRYPTION_KEY` must be backed up separately; neither is product state that belongs in MongoDB.

## Definition of Done

The port is ready when:

1. Every VRCX area has a documented `Remote-compatible`, `Server-derived`, `Browser-adaptable`, `Local-VRChat-only`, `Product-excluded`, or `Unclear` decision supported by source paths.
2. The server can establish, persist securely, validate, recover, and replace the one active VRChat session without a separate application identity system.
3. The monitor stays healthy without an open browser, reconnects after failures, reconciles missed state, respects rate limits, and never processes the same upstream fact twice.
4. VRCX-equivalent durable data is stored in MongoDB with validated schemas, indexes, migrations, retention, backup, and restore guidance.
5. Eligible navigation, screens, dialogs, interactions, and states match VRCX at reference desktop viewport sizes, with only documented browser differences.
6. Narrow layouts remain usable without changing the VRCX visual identity or silently dropping important content.
7. Local-VRChat-only features are absent and do not leave dead routes, controls, or misleading data.
8. Credentials, session material, and database secrets remain server-side, encrypted where persisted, and absent from logs and client storage.
9. Startup, restart, disconnection, malformed payload, session expiry, upstream outage, and rate-limit behaviors have automated coverage.
10. Unit/integration tests, lint, production build, visual comparisons, and the operator's authenticated smoke tests pass.
11. Copied VRCX code and assets retain required MIT notices and provenance.
12. This roadmap and the difference register match the shipped behavior.

## Feature Eligibility Inventory

This inventory replaces the old browser-only scope. `Server-derived` means the feature is eligible only to the fidelity supported by continuous remote observation; it does not permit fabricated local-game data.

| Area | Decision | Port direction |
| --- | --- | --- |
| Login, TOTP/OTP/email OTP, session recovery, logout | Remote-compatible | Port VRCX auth behavior into server-only routes and persist only encrypted restart state required for the single monitor |
| Main layout, navigation, themes, status bar, dialogs, eligible settings | Browser-adaptable | Rebuild from VRCX layout/components/styles; remove only controls for excluded native integrations |
| Friends Locations, online sidebar, presence | Remote-compatible | Drive live UI from MongoDB projections updated by Pipeline events and HTTP reconciliation |
| Feed and Friend Log | Server-derived | Persist remote relationship, presence, location, status, display name, bio, avatar, and notification changes observed continuously by the server, including equivalent changes made by the active identity |
| Friend List and user details | Remote-compatible | Port complete remote-backed tables, filters, tabs, dialogs, and actions |
| Search for users, worlds, groups, avatars | Remote-compatible | Port approved provider/API searches through allowlisted server boundaries |
| Favorite friends, worlds, avatars and local groups | Remote-compatible | Persist remote favorite state and VRCX-local organization in MongoDB |
| Notifications and invite responses | Remote-compatible | Ingest Pipeline plus HTTP reconciliation; port remote actions; exclude join actions requiring the running game |
| Moderation | Remote-compatible | Port remotely supported player/avatar moderation display and actions |
| My Avatars | Browser-adaptable | Port remote management and browser upload/crop workflows; persist tags/memos/cache metadata in MongoDB |
| Dashboard | Product-excluded | Do not port it; remove the existing prototype route and navigation entry rather than rebuilding VRCX dashboard widgets |
| Mutual Friends chart | Server-derived | Store graph, opt-outs, cursors, and rate-limited fetch jobs in MongoDB |
| Hot Worlds chart | Server-derived | Rank remotely observed friend GPS transitions from MongoDB with explicit coverage limits and VRCX-equivalent period trends |
| Instance Activity chart | Local-VRChat-only | Exclude it because VRCX requires local `OnPlayerLeft` rows for every player, exact overlap, and local instance occupancy |
| Previous instances for users/worlds/groups | Server-derived | Build from remotely observed locations with explicit observation-source semantics |
| Game Log — sessions view only | Server-derived | Port the VRCX session list from remote observations of the active account's location, including world/group metadata, observed start/end and duration, current state, remotely observed self Feed events within each session, search, date filtering, collapse, and incremental loading; omit table mode and unavailable local-log event controls |
| Browser notifications | Browser-adaptable | Optional browser delivery may mirror eligible VRCX notifications after permission is granted |
| Application preferences and import/export | Browser-adaptable | Store authoritative preferences in MongoDB; use explicit browser downloads/uploads for import/export |
| Game Log flat table and local event details | Local-VRChat-only | Do not expose table mode; exclude raw player join/leave, portal, video, resource, external, and local event records unavailable through remote APIs |
| Player List and Photon data | Local-VRChat-only | Exclude current-instance Photon/player tracking that requires the running game |
| Gallery and screenshot metadata | Local-VRChat-only | Exclude local screenshot watching and filesystem metadata tooling |
| VR overlay, OpenVR, Steam, registry, process, launch/attach, IPC, window, tray, Electron updater | Local-VRChat-only | Exclude navigation, controls, and settings |
| Local OSC integrations tied to VRChat | Local-VRChat-only | Exclude because the server must not require a local VRChat client |

## Existing Prototype Assessment

The root prototype already contains useful VRChat server routes and partial React screens for login, friends, favorites, moderation, notifications, avatars, dashboard, activity, and mutual friends. These are inputs to the new port, not completed slices.

Known rework required:

- Replace browser-owned two-minute friend polling with the always-on monitor and MongoDB-backed projections.
- Replace `localStorage` activity, graph, appearance, navigation, and view preferences with MongoDB repositories and server APIs.
- Re-audit session persistence for restart-safe, encrypted single-user monitoring.
- Replace the current custom web shell and screen styling with components and values ported directly from VRCX.
- Reassess each previous exclusion under the `Server-derived` classification.
- Add a MongoDB-backed Game Log route that exposes only the VRCX session view and removes the session/table switch.
- Remove the prototype Dashboard route and navigation entry; Dashboard is not a parity target.
- Remove claims that features are complete until matched-state screenshots and interactions prove VRCX parity.

## Game Log Session Scope

Game Log is an eligible, required feature with a deliberately narrow presentation contract.

### Authoritative VRCX Sources

- `VRCX/src/views/GameLog/GameLog.vue` for the sessions-mode container.
- `VRCX/src/views/GameLog/components/GameLogSessions.vue` for the toolbar, filtering, loading, empty, and infinite-scroll behavior.
- `VRCX/src/views/GameLog/components/GameLogSessionsSegment.vue` and `GameLogSessionsEvent.vue` for session headers and eligible nested content.
- `VRCX/src/views/GameLog/sessions/buildGameLogSessions.js` for segment construction behavior that remains applicable to remote observations.
- `VRCX/src/stores/gameLog/index.js` and `VRCX/src/services/database/gameLog.js` for session state, filtering, pagination, and query semantics to translate into server services and MongoDB repositories.

Direct reuse or close TypeScript/React translation of these MIT-licensed sources is preferred when it produces the closest result. Generic replacement cards or a redesigned timeline do not satisfy the requirement.

### Included Remote-Derived Data

- Location/instance identifier observed for the active account.
- Resolved world name and group metadata available from approved APIs.
- Observed session start, end, and duration, including a current/open session state.
- Upstream, Pipeline, reconciliation, and ingestion timestamps needed to distinguish exact facts from bounded observations.
- GPS, Online, Offline, Status, Avatar, and Bio changes made by the active identity while they can be associated with an observed location session.
- Search, bounded date-range filtering, collapse/expand, newest-first incremental loading, skeleton, empty, stale, reconnect, and authentication-required states.

The monitor opens or transitions a session when the active account's remotely visible location changes. It closes or marks a session bounded when the account becomes offline/private/unobservable, the location changes, or reconciliation proves the prior state ended. Because the API may not expose the exact local game launch or exit instant, records retain precision/provenance and the UI must not overstate it.

### Explicitly Excluded Data and UI

- Flat Game Log table mode and the sessions/table toggle.
- Local-log player join/leave events and member counts.
- Portal spawn, video play, string/image/resource load, arbitrary event, and external-log rows.
- Local game-running state, Photon occupancy, and any claim that an API-observed session exactly equals a local VRChat process lifetime.
- Filters, counters, actions, and nested rows that would be nonfunctional without those excluded event types.

Apart from these explicit omissions, the page must reproduce VRCX session mode's component structure, sizes, spacing, typography, colors, borders, sticky behavior, icons, badges, interactions, and all meaningful states at matched viewports.

## Feed and Friend Log Scope

The MongoDB-backed activity projection is split into the same two presentation surfaces as VRCX. `VRCX/src/views/Feed/Feed.vue`, `VRCX/src/views/Feed/columns.jsx`, and `VRCX/src/stores/feed.js` are the source for Feed filters, favorite-only behavior, dense columns, expandable detail rows, sorting, and pagination. `VRCX/src/views/FriendLog/FriendLog.vue`, `VRCX/src/views/FriendLog/columns.jsx`, and `VRCX/src/services/database/friendLogHistory.js` are the source for Friend Log type selection, user-change rendering, row deletion, and confirmation behavior.

The server records only facts available through Pipeline events or HTTP reconciliation. Feed includes GPS, Online, Offline, Status, Avatar, and Bio changes. Friend Log includes Friend, Unfriend, FriendRequest, DisplayName, and TrustLevel changes. A dedicated owner-scoped `self_snapshots` baseline subjects the active identity to the same non-relationship diff as other observed users, so their own Feed changes are retained and their remotely observed Feed events are nested into an overlapping Game Log session. The initial self observation establishes a baseline without fabricating Friend or Online history. `VRCX/src/coordinators/userCoordinator.js` and `userEventCoordinator.js` currently skip this because the current user is absent from the friend map; recording self activity is an intentional product difference required on 2026-08-08. VRCX's `CancelFriendRequest` filter is intentionally omitted because the remote notification projection cannot distinguish cancellation from expiration or dismissal reliably. Avatar detail shows remotely observed image URLs but cannot reproduce historical avatar names or owners that were never supplied by the API. Online/offline duration is not shown unless both boundaries were actually observed. No value is fabricated to fill these gaps.

VRCX-persisted type filters, favorite-only state, and page size are stored in the singleton MongoDB settings document. Search and the active date range remain transient view state. Feed keeps expandable rows and never exposes destructive history controls; Friend Log keeps row-level deletion with confirmation and Shift-click bypass. On narrow screens the dense source table remains horizontally scrollable inside its content pane so columns are retained rather than silently dropped.

## Previous Instances Scope

`VRCX/src/components/dialogs/PreviousInstancesDialog/PreviousInstancesListDialog.vue`, `previousInstancesColumns.jsx`, `VRCX/src/stores/instance.js`, and the `getPreviousInstancesByUserId`, `getPreviousInstancesByWorldId`, and `getPreviousInstancesByGroupId` queries in `VRCX/src/services/database/gameLog.js` define this shared history dialog and its User, World, and Group entry points. The port retains the title and entity label, dense newest-first table, search, date/time sorting, 10/25/50/100 row sizes, paging, loading and empty states, and a full-height narrow layout with table-local horizontal scrolling.

This is a `Server-derived` workflow. Another user's rows are reconstructed from owner-scoped `Online`, `GPS`, and `Offline` activity events, including the prior snapshot observation time retained with a first GPS transition. The active identity's user rows and all world/group rows come from durable `game_sessions`; world and group queries group visits by the exact observed location string and sum only bounded observed durations. Cached world and group documents supply display metadata. Migration 26 adds owner/world/start and owner/group/start indexes alongside the existing owner/location/start query path. All repository and API work is server-only, the response is schema-validated and `private, no-store`, and the browser owns no durable history.

Dates, durations, current state, and the `Observed` badge describe remote observation bounds rather than local VRChat process facts. A private, offline, or otherwise unobservable transition closes the previous interval without inventing the hidden destination. VRCX's Launch action, local Game Log deletion, and per-instance player-info action are omitted because they require the local client or local player join/leave records. The dialog never fabricates co-presence, player membership, or an exact local visit boundary. This source-derived comparison still requires matched-state capture against a running VRCX instance before global visual parity can be claimed.

## Friend List Scope

`VRCX/src/views/FriendList/FriendList.vue` and `VRCX/src/views/FriendList/columns.jsx` are the authoritative sources for the toolbar, dense sortable table, favorite-only mode, selectable search fields, profile loading, mutual-friend loading, bulk unfriend mode, individual unfriend action, and pagination. The web port retains every remote-backed column: avatar, display name, trust rank, status, languages, bio links, mutual count/opt-out, remotely observed last seen, last activity, last login, and date joined. Full-profile loading enriches the MongoDB user cache and is merged with the fresher presence snapshot on subsequent reads. Mutual graph fetching is shared with the chart and persists its completed snapshot in MongoDB.

Join Count and Time Together remain omitted because VRCX derives them from local game logs. Friend List now reproduces VRCX's complete selectable search-field set and default: Display Name, Rank, Status, Bio, VRChat Note, and VRCX-local Memo are searched when no field is selected, while User Name is opt-in. Notes come from the owner-scoped cached VRChat user projection and memos are joined from `entity_memos` into the typed `/api/friends` response; successful edits update the in-memory table projection immediately and the next refresh re-reads MongoDB. Neither value is added as a table column because the VRCX reference uses them only as search metadata. VRCX's historical friend number cannot be reconstructed exactly for identities first seen after this server port starts; the `No` column uses a stable current-projection fallback until prospectively observed relationship ordering exists. This difference must not be presented as an exact friendship-age claim. The wide source table scrolls within its content pane at narrow widths rather than dropping columns.

## User Dialog Scope

`VRCX/src/components/dialogs/UserDialog/UserDialog.vue`, `UserSummaryHeader.vue`, `UserDialogInfoTab.vue`, `UserDialogMutualFriendsTab.vue`, `UserDialogGroupsTab.vue`, `UserDialogWorldsTab.vue`, and `UserDialogActivityTab.vue` define the ported dialog structure. The web dialog keeps the fixed-width summary card, banner/avatar overlap, status and trust metadata, badges, relationship action, underline tabs, Mongo-backed last-active tab, and responsive stacked layout. The Info tab is built from the freshest Mongo friend projection merged with cached full-profile fields. Mutual friends, public groups, and authored worlds use typed, allowlisted VRChat routes and populate their Mongo caches. Activity renders a day/hour heatmap only from remotely observed Feed events, and labels the count accordingly. JSON is rendered as text and never includes server session material.

Other-user Avatars remain absent because VRCX obtains them from its optional external avatar database rather than the VRChat API. Authored-world cards open the maintained World Dialog and group cards open the maintained Group Dialog. Activity cannot reproduce VRCX's local-log online-frequency precision and therefore must not imply uninterrupted presence between observations. VRChat notes are editable through the fixed `userNotes` server route with VRCX's 256-character, single-line behavior, while the separate VRCX-local memo is owner-scoped in MongoDB. Both update the maintained user projection without exposing session material.

The summary relationship action follows VRCX's remote-compatible state machine: a non-friend can send a request, an incoming request can use VRCX's send-endpoint acceptance fallback, an outgoing request can be cancelled, and a friend can be removed. Friend profiles also expose VRCX's favorite action for the current VRChat favorite group and independent MongoDB-local group membership. All mutations require a same-origin request and use fixed, ID-validated upstream paths. Actions for the active identity are hidden. Invite, Request Invite, Join, and local-client navigation remain omitted because they depend on the running VRChat client or its current local location.

## World Dialog Scope

`VRCX/src/components/dialogs/WorldDialog/WorldDialog.vue`, `WorldDialogInfoTab.vue`, `WorldDialogInstancesTab.vue`, and `useWorldDialogInfo.js` define the ported world-details structure. The browser port retains VRCX's `892px` desktop dialog, `160px` by `120px` world image, author link, release/content/platform badges, description, compact actions, Info/Instances/JSON tabs, editable private memo, dense metadata tiles, copy/share behavior, and friend tiles. It opens from Search, Favorites, and authored worlds in User Dialog. The fixed world route reads the owner-scoped MongoDB cache first and refreshes through the typed VRChat service boundary; no upstream session material reaches JSON view.

Instances contain only the tuples returned by the remote world response and friends currently visible in the server-maintained presence projection. VRCX's local cache status and deletion, local-log time-spent and last-visit values, new-instance creation, launch, join, invite, and local client navigation are omitted because they require local files, logs, or a running VRChat client. The dialog does not infer hidden/private instance details. The VRCX favorite action is ported for both VRChat and MongoDB-local groups.

The owned-world Manage menu follows `WorldDialog.vue`, `useWorldDialogCommands.js`, `SetWorldTagsDialog.vue`, `WorldAllowedDomainsDialog.vue`, and VRCX's shared image cropper. Rename, description, hard capacity, recommended capacity, YouTube preview, content warnings/settings/tags, allowed video-player domains, world-image editing, publish/unpublish, and deletion are available only when a freshly fetched authoritative world identifies the active singleton identity as its author. Each same-origin request accepts exactly one maintained operation, uses a fixed upstream path, updates the owner-scoped MongoDB world projection, and preserves upstream-success semantics when the local projection needs reconciliation. Metadata updates enforce the resulting recommended-capacity invariant; the browser accepts VRCX's direct YouTube ID and common URL workflows while the server persists only a validated compact video ID. Tag updates accept VRCX's named control state instead of browser-supplied protected tags, reconstruct editable tags from the authoritative world, retain custom content tags and unknown disabled abilities, and preserve protected upstream tags in the fallback projection. Domain updates accept a bounded, unique list. Image updates use the shared VRCX-derived 4:3 cropper, upload only bounded PNG/JPEG/WebP data with the fixed `worldimage` tag, validate the returned complete file against the active owner, and then set the fixed world's `imageUrl`. Publication uses only the fixed `worlds/{worldId}/publish` child, and destructive deletion removes only the active owner's cached world after upstream success. User-specific persistent-data state and deletion remain eligible follow-up work and require a separate remotely reconciled projection because they also apply to worlds the active user does not own. Download Unity Package remains excluded because it is a local package workflow.

## Group Dialog Scope

`VRCX/src/components/dialogs/GroupDialog/GroupDialog.vue`, `GroupDialogInfoTab.vue`, `GroupDialogPostsTab.vue`, `GroupDialogMembersTab.vue`, `GroupDialogPhotosTab.vue`, `useGroupMembers.js`, `useGroupGalleries.js`, `VRCX/src/api/group.js`, and `VRCX/src/stores/instance.js` define the maintained group-details slice. It keeps VRCX's `892px` desktop width, `120px` icon, name and discriminator hierarchy, owner navigation, verification/privacy/join/membership/language badges, description, compact refresh/share actions, banner, remote group-instance rows, visible friend tiles, rules, member counts, creation date, links, roles, announcement, searchable posts, paged searchable member tiles, Info/Posts/Members/Photos/JSON tabs, and responsive full-screen narrow layout. Search, User Dialog, and the desktop group sidebar all open this internal dialog. The fixed group route accepts only a validated group ID, reads a complete owner-scoped MongoDB entity first, and refreshes compact membership/search records through the typed VRChat boundary with roles included.

Post snapshots and incrementally fetched member pages are validated before being stored in owner-scoped `group_posts` and `group_members` collections. Replacing a complete post snapshot retains removed rows as inactive history, while member pages are upserted without pretending an incomplete page is the full roster. Migration 20 adds unique owner/group/entity indexes, and migration 31 adds the owner/group `group_post_snapshots` completion marker so an authoritative empty list is reusable instead of forcing another upstream read. The header and management menu port VRCX's remotely supported join, request, cancel-request, leave, representation, announcement subscription, event-announcement subscription, public-group visibility, block, and unblock state machine. Each same-origin mutation uses a fixed, ID-validated route, re-fetches the complete group when possible, and updates its MongoDB membership projection.

Group post creation, editing, and deletion follow `GroupPostEditDialog.vue`, `GroupDialogPostsTab.vue`, `GroupDialogInfoTab.vue`, the `group-announcement-manage` permission check in `shared/utils/group.js`, and the fixed `groups/{groupId}/posts` upstream requests in `api/group.js`. Both the Info announcement and Posts tab expose edit/delete only when the freshly loaded `myMember.permissions` contains that permission or `*`; the server independently fetches the complete group with roles and rejects unauthorized or cross-group role submissions before mutation. The dialog preserves VRCX's required title/message, create-only notification toggle, public/group visibility, multi-role targeting, existing-image retention/removal, modal keyboard flow, and immediate announcement/list updates. Successful create/edit rows are upserted and deletion marks the durable row inactive without incorrectly manufacturing a complete snapshot when none was previously observed.

Post image selection follows `GallerySelectDialog.vue`, `api/vrcPlusIcon.js`, and `api/vrcPlusImage.js`: the server lists the active identity's fixed `files?tag=gallery&n=100` resource and uploads to fixed `file/image` multipart form data without exposing VRChat cookies to the browser. Every file is validated against the active owner and `gallery` tag, and only the latest complete, non-deleted version is selectable. Migration 32 stores complete and authoritative-empty personal Gallery snapshots in `personal_file_snapshots`; successful uploads are inserted into an existing complete projection, while a missing snapshot remains unknown until reconciliation. The picker preserves VRCX's count, None, Refresh, VRChat+-gated Upload, fixed `200px` tiles, selection, nested modal focus, and Escape restoration. Uploads retain VRCX's 100 MB boundary but explicitly allow only PNG, JPEG, WebP, and GIF rather than forwarding arbitrary `image/*` content.

Group invitations follow `InviteGroupDialog.vue`, the `group-invites-manage` permission in `shared/utils/group.js`, and VRCX's fixed `groups/{groupId}/invites` request. The Manage menu exposes the action only for `group-invites-manage` or `*`, and the server independently refreshes the complete group before accepting a strict, unique list of canonical user IDs selected from the friend UI. The dialog preserves searchable multi-selection and explicit confirmation, traps keyboard focus, restores the Manage trigger on Escape, and submits invitations sequentially like VRCX. A partial upstream failure stops the sequence, reports the failed friend, and removes already successful IDs from the selection. Because invitation creation is not idempotent, a cookie-persistence failure after upstream success is returned as success with reconciliation requested rather than encouraging duplicate delivery.

Group member moderation follows `GroupMemberModerationDialog.vue`, `GroupModerationMembersTab.vue`, `groupMemberModerationMembersColumns.jsx`, `GroupModerationBulkActions.vue`, `useGroupModerationData.js`, `useGroupModerationSelection.js`, and `useGroupBatchOperations.js`. VRCX's full moderation-permission union controls the Manage-menu item; the Members slice preserves complete paged roster loading, member count, join/name sorting, role filtering, the three-character threshold backed by the fixed remote `members/search` request, selection from rows or canonical user IDs, manager notes, multi-role selection, and sequential add-role, remove-role, note, kick, ban, and unban batches with progress and cancellation. The server independently refreshes the authoritative group and checks the exact capability for every target/action, rejects foreign role IDs and destructive self-actions, and permits only canonical group/user/role paths through the upstream allowlist. Existing owner-scoped `group_members` rows are the durable read projection. Successful notes and role changes re-fetch and upsert the member; successful kick and ban actions mark that owner's member row inactive; projection or encrypted-cookie persistence failures request refresh without reclassifying a completed upstream mutation as a failure.

The moderation Bans tab follows `GroupModerationBansTab.vue`, `groupMemberModerationBansColumns.jsx`, `GroupMemberModerationBanExportDialog.vue`, and `GroupMemberModerationBanImportDialog.vue`. It preserves VRCX's dense selected/avatar/name/roles/notes/joined/banned columns, newest-ban ordering, search, paging, select-all, shared bulk-action area, configurable CSV export fields, raw-ID or VRCX-CSV import, deduplication, sequential one-second ban pacing, progress, cancellation, and result reporting. Migration 33 adds the owner/group-unique `group_ban_snapshots` complete projection, so an authoritative empty ban list is durable. Refresh reads every fixed `groups/{groupId}/bans` page only after an authoritative `group-bans-manage` check; successful ban/unban actions update an existing complete snapshot, while a missing snapshot or local projection failure requests reconciliation without reporting a completed upstream mutation as failed. CSV labels retain VRCX's field set, with formula-looking upstream cells neutralized for spreadsheet safety.

The moderation Invites tab follows `GroupModerationInvitesTab.vue`, its sent-invite/join-request/blocked-request column definitions, `useGroupModerationData.js`, and `useGroupBatchOperations.js`. It preserves the three nested count tabs, refresh, select-all, dense avatar/name/note tables, paging, and sequential delete-invite, accept, reject, block, and delete-blocked actions with progress and cancellation. Migration 34 adds the owner/group-unique `group_invite_snapshots` complete projection; refresh pages all three fixed remote lists through an authoritative `group-invites-manage` check. Completed actions update an existing complete projection, accepted member payloads are added to the durable member projection when valid, and projection/cookie failures request reconciliation without reclassifying upstream success. Sending a new invitation invalidates any complete moderation snapshot because that endpoint does not return the full invite row.

The moderation Logs tab follows `GroupModerationLogsTab.vue`, `groupMemberModerationLogsColumns.jsx`, `GroupMemberModerationExportDialog.vue`, `groupModerationUtils.js`, and the audit-log loaders in `useGroupModerationData.js`. It preserves VRCX's refresh/count toolbar, compact multi-type selector, description search, sortable Created At/Type/Display Name columns, Description/Data columns, paging, actor User Dialog links, and configurable click-to-copy CSV export. Migration 35 stores owner/group/filter-specific complete snapshots in `group_audit_log_snapshots`, including available types and a truthful 5,000-row truncation marker. The server independently checks `group-audit-view`, validates selected types against the group's current `auditLogTypes`, uses the upstream comma-separated `eventTypes` contract, deduplicates by audit ID, and retains filter-specific durable results without allowing a partial filter to overwrite the all-events snapshot.

Remote instance enumeration uses VRCX's fixed `users/{currentUserId}/instances/groups/{groupId}` dialog request and the aggregate `users/{currentUserId}/instances/groups` update-loop request. Responses validate every rendered instance/world field and must match both the requested group and embedded location tag. Migration 28 adds the owner/group-unique `group_instance_snapshots` collection; complete snapshots preserve upstream and local observation timestamps, including an authoritative empty result. The singleton monitor refreshes all active memberships without a browser, removes snapshots for memberships no longer present, and retains the last complete result when VRChat rate-limits or transiently fails its aggregate endpoint. The Info tab renders remotely reported worlds and player capacity even when no visible friend is present, then merges exact-location friend tiles and sorts them using VRCX's friend-count/player-count precedence.

Group calendar reads use VRCX's fixed `calendar/{groupId}` list request and per-event detail request, with the latter enriching `userInterest` without making the base event disappear when an optional detail call is unavailable. Migration 29 stores a complete owner/group calendar snapshot, including authoritative empty results, upstream pagination metadata, and observation time. The Info tab ports VRCX's start-time ordering, `endsAt` upcoming/past boundary, one-occurrence-per-series behavior, `320px` event cards, banner fallback, access type, interested count, keyboard/touch-expandable details, safe VRChat event-link copy, and remote follow/unfollow action. Follow responses update the persisted event in place through a same-origin, fixed-ID route. The Download `.ics` action uses VRCX's authenticated official `calendar/{groupId}/{eventId}.ics` resource through a fixed server-only route; it validates the calendar envelope, rejects binary or responses over 1 MiB, and returns the unchanged bytes with a safe event-ID filename and `text/calendar` attachment headers.

Group Photos uses the gallery descriptors embedded in the complete group response and VRCX's fixed `groups/{groupId}/galleries/{galleryId}` request. The server pages each gallery in 100-row batches with VRCX's 50-page bound, rejects cross-group/cross-gallery payloads, deduplicates repeated image IDs, and marks a 5,000-row boundary as truncated rather than claiming a complete count. Migration 30 stores complete and authoritative-empty owner/group snapshots in `group_gallery_snapshots`, including gallery restrictions, images, truncation metadata, and observation time. The tab ports VRCX's nested gallery tabs, public/member/role restriction dots, counts, descriptions, `200px` minimum image grid, refresh state, lazy image fallback, and fullscreen image action with Escape, focus restoration, and touch/keyboard access. Automatic image requests remain limited to VRCX's three allowlisted media origins. Gallery reads are demand-driven server requests, as in VRCX, rather than a background historical observation stream; the durable snapshot survives browser closure and server restart without polling every group gallery.

Although `VRCX/src/api/group.js` defines group editing, role creation/editing, and calendar create/edit/delete requests, repository-wide caller searches find no current VRCX view that invokes those mutations. Adding group-configuration, role-authoring, or calendar-authoring UI would therefore be a redesign rather than a VRCX port, so none is a parity target unless an authoritative VRCX surface is introduced. The Photos tab likewise remains read-only because the authoritative VRCX surface exposes no gallery mutation controls. VRCX's native “Export to calendar” OS-association launch has no truthful browser equivalent and remains absent; its separate `.ics` download is ported. Local-log last-visited data and local launch, join, instance-invite, queue-management, and instance-closing actions remain excluded. Group links are scheme-checked before rendering, and JSON contains only the parsed upstream group entity.

## Notifications Scope

`VRCX/src/views/Notifications/Notification.vue` and `VRCX/src/views/Notifications/columns.jsx` are the authoritative sources for the notifications toolbar, multi-type filter, dense columns, sorting, pagination, and row actions. The web port combines active legacy, V2, and hidden notification projections maintained by the server monitor and renders VRCX's Date, Type, User, Group, Photo, Message, and Action columns. Type selections and table page size are stored in the singleton MongoDB settings document; search and sort direction remain transient view state.

Legacy friend requests retain the remotely supported accept action. V2 notifications render only the response descriptors supplied by the API, including safe external links, and both upstream sources retain their supported hide action. Deleting a MongoDB notification-history row is deliberately separate from hiding an upstream notification and requires confirmation unless Shift is held, matching the relevant VRCX interaction. Hidden notifications expose only that local-history deletion action. Untrusted notification text is rendered as text, and external image and link schemes are allowlisted.

Automatic image loading is further restricted to the three media origins declared by VRCX in `VRCX/src/index.html`: `api.vrchat.cloud`, `files.vrchat.cloud`, and `assets.vrchat.com`. A valid HTTP(S) notification image URL outside those origins remains an explicit no-referrer link with an image placeholder, so an upstream payload cannot trigger a browser request to an arbitrary public or private host.

Invite-request acceptance and Join actions are intentionally absent because VRCX fulfills them through the running local VRChat client and its current location. The server does not invent equivalent actions or claim it can join an instance through the remote API. V2 notifications never use the legacy friend-request accept endpoint even when an upstream type string resembles a friend request. At narrow widths the complete source table scrolls inside its content pane rather than dropping columns.

## Search Scope

`VRCX/src/views/Search/Search.vue`, `components/SearchPagination.vue`, and the four `composables/useSearch*.js` files define the search layout, controls, result density, and pagination behavior. The web port retains the shared search field, clear-results action, User/World/Group tabs, Enter-to-search behavior, Alt+Arrow pagination shortcuts, user bio and last-login options, Community Labs toggle, and VRChat-provided dynamic world categories. Search responses populate the owner-scoped MongoDB user, world, and group caches before reaching the browser.

User results preserve the avatar, display name, trust level, languages, and one-line bio structure and open the maintained User Dialog. World results preserve VRCX's compact `180px` card grid and open the maintained World Dialog. Group results preserve its dense avatar/name/member/short-code/description rows and open the maintained Group Dialog. Narrow screens reflow the tab/search toolbar and grid without changing the desktop information hierarchy.

The Avatar tab is intentionally absent. VRCX searches avatars only through an optional, separately configured external avatar database; the official VRChat API does not provide that search workflow. The tab must not appear until a user-approved remote provider integration, server-side provider allowlist, credential boundary, and corresponding VRCX provider settings are implemented. My Avatars remains a separate official-API-backed workflow.

## Favorites Scope

`VRCX/src/views/Favorites/FavoritesFriend.vue`, `FavoritesWorld.vue`, `FavoritesAvatar.vue`, `components/FavoritesToolbar.vue`, `FavoritesContentHeader.vue`, the three favorite item components, `composables/useFavoritesCardScaling.js`, `composables/useFavoritesGroupPanel.js`, `styles/favorites-layout.css`, and `styles/favorites-card.css` define the Favorites port. The web application keeps VRCX's separate friend, world, and avatar routes; remote and local group panel; name/date sorting; cross-group search; scale and spacing controls; edit mode; select-all and bulk removal; remote group display-name, visibility, move, unfavorite, and clear actions; and local group create, rename, delete, copy, and remove workflows. Remote favorite and group projections are retained in MongoDB, while VRCX-local groups and memberships are MongoDB-native and scoped to the one active owner. Favorite layout settings are stored in the singleton MongoDB settings document.

At desktop widths the fixed group pane and dense responsive card grid closely translate VRCX. At narrow widths the group pane becomes a select with adjacent manage and local-group creation controls so no workflow depends on hover or disappears. Friend, world, and avatar cards open their maintained internal dialogs. VRCX avatar history is excluded because it reads the desktop application's local avatar history database. Local-game request, invite, launch, and join actions remain absent.

`dialogs/FriendImportDialog.vue`, `FriendExportDialog.vue`, `WorldImportDialog.vue`, `WorldExportDialog.vue`, `AvatarImportDialog.vue`, and `AvatarExportDialog.vue` define the eligible Favorites transfer workflows. The browser port accepts pasted IDs or text/CSV files, deduplicates type-correct IDs, resolves each item through owner-scoped MongoDB caches and fixed VRChat user/world/avatar routes, shows per-item validation, and imports into either a capacity-checked VRChat group or a MongoDB local group. Cancellation stops the browser operation without exposing credentials. Export covers the current group/search or all groups, selectable VRCX-relevant columns, copy, and CSV download. CSV cells are quoted and formula-looking upstream labels are neutralized before spreadsheet use.

Compatibility is verified against the actual VRCX `UserID,Name`, `UserID,DisplayName,Memo`, `ID,Name`, and `AvatarID,AvatarName` layouts, including the Favorites dialogs' reversed header position. The importer detects those VRCX CSVs, requires canonical UUID placement, caps files at 1 MB and unique candidates at 1,000, and still performs remote/server validation before persistence. VRCX registry backups are classified `Local-VRChat-only` because they contain Windows VRChat registry state; VRCX exposes no general portable application/database export. Friend-list and owned-avatar CSVs provide eligible IDs for an operator-selected Favorites group, but are not treated as full friend/avatar state restoration.

## Memo Scope

VRCX's user, world, and avatar memo coordinators and the memo fields in their three detail dialogs define this browser-compatible local-data workflow. A single validated, origin-checked memo route accepts only type-correct `usr_`, `wrld_`, or `avtr_` identifiers and stores trimmed private text in the owner-scoped `entity_memos` collection. Empty values delete the row. A migration adds unique owner/type/entity and recency indexes. The shared field loads on dialog open and saves on blur while exposing loading and error states; memo text never leaves this server for VRChat.

## Moderation Scope

`VRCX/src/views/Moderation/Moderation.vue`, `views/Moderation/columns.jsx`, `stores/moderation.js`, `coordinators/moderationCoordinator.js`, `api/playerModeration.js`, `api/avatarModeration.js`, and `shared/constants/moderation.js` define the remote moderation surfaces. The port keeps VRCX's multi-type player filter, display-name search, newest-first sortable Date, Type, Source, Target, and Action columns, user-dialog links, pagination, linked page size, refresh, confirmation, and Shift-click confirmation bypass. Filters and page size are stored in the singleton MongoDB settings document. Active player and avatar moderations are read from owner-scoped MongoDB projections continuously repaired by the server monitor; manual player refresh invokes that same reconciliation boundary instead of creating a second browser-owned polling path. Removing a player moderation updates VRChat first and deactivates the MongoDB projection only after upstream success.

The complete dense table scrolls within its pane on narrow screens rather than being redesigned as mobile cards or dropping columns. Avatar moderation remains in Avatar Dialog rather than this player-moderation table, matching VRCX's visible screen. Migration 36 adds the `avatar_moderations` projection with owner/target/type uniqueness and owner/active/recency query indexes. Startup and scheduled reconciliation fetch `auth/user/avatarmoderations` with player moderations, so the dialog state recovers without a browser. Photon moderation events and current-instance player state remain excluded because they depend on the local game process and logs.

## My Avatars Scope

`VRCX/src/views/MyAvatars/MyAvatars.vue`, `components/MyAvatarCard.vue`, `columns.jsx`, `ManageTagsDialog.vue`, and `composables/useAvatarCardGrid.js` define the official-API-backed owned-avatar screen. The web port retains VRCX's Grid/Table switch, filter popover, visibility/platform/local-tag filters, search, card scale and spacing controls, responsive dense card grid, active-avatar highlight, click-to-wear confirmation, compact operation menus, tag management, refresh, sortable wide table, and pagination. View mode, grid metrics, table page size, and VRCX-local colored avatar tags are stored in MongoDB. Owned avatar responses are also cached owner-scoped in MongoDB before they reach the browser.

## Avatar Dialog Scope

`VRCX/src/components/dialogs/AvatarDialog/AvatarDialog.vue` and `useAvatarDialogCommands.js` define the maintained avatar-details slice. The browser port keeps the `892px` desktop dialog, `160px` by `120px` image, name/author hierarchy, public/private and platform/performance badges, styles, content and author tags, description, current/select state, refresh/share actions, Info/JSON tabs, editable private memo, ID copying, created/updated/version/platform metadata, and full-screen narrow layout. Favorite Avatar and My Avatars detail actions open this dialog. Compact favorite/owned records are refreshed through the fixed typed avatar route when they do not contain the author and platform detail required by the dialog; complete records remain owner-scoped in MongoDB.

Local VRChat cache size/deletion, cache file analysis, local-log time spent, avatar history, and local filesystem package download remain excluded. The VRCX favorite action is ported for both VRChat and MongoDB-local groups. Avatar block/unblock is ported through the same compact Manage menu, blocked-state destructive trigger, VRCX confirmation text and destructive semantics, and fixed-purpose origin-checked action route. Upstream success is never reclassified as failure when only the MongoDB projection or encrypted-cookie persistence fails; the response instead requests reconciliation. Gallery display preserves VRCX's one-image carousel, navigation and fullscreen preview; published marketplace listings retain image, name, token price and description. Only the authoritative avatar author receives browser upload controls. Migration 37 stores complete owner/avatar gallery snapshots for restart recovery; dialog open and explicit refresh reconcile the VRCX `files?tag=avatargallery&galleryId=...` query without a browser-owned polling loop. The Manage menu also preserves VRCX's Quest-tag-gated fallback selection and owner-only Make Public/Private, Rename, Change Image, Change Description, Change Content Tags, Change Styles and Author Tags, Create/Regenerate/Delete Impostor, and Delete commands with their original prompt/confirmation and destructive states. Change Image translates `ImageCropDialog.vue` and `useImageCropper.js` into an in-browser 4:3 editor with the same 850px dialog bound, 400px editing bound, pan, rotation, horizontal/vertical flip, logarithmic zoom, fit/free mode, reset, cancel and crop controls. The cropped PNG is sent only after confirmation to a fixed-purpose server route. That route re-fetches the authoritative avatar, verifies singleton ownership, uploads only the fixed `avatarimage` tag, validates the returned file owner/tag/complete URL, then sets that URL through the fixed avatar endpoint and refreshes the MongoDB projection. If VRChat accepts the non-idempotent file upload but the follow-up cannot be proven complete, the response records partial acceptance and instructs refresh before retry rather than inviting a duplicate upload. Content tags retain VRCX's five warning toggles, custom CSV input, complete owned-avatar selection and sequential batch save. Style editing retains Primary/Secondary selectors and author-tag CSV; migration 38 stores the complete owner-scoped `avatarStyles` option snapshot. My Avatars card and table commands pass their intended editor as an explicit one-shot command to the shared Avatar Dialog, which revalidates ownership before directly opening the corresponding maintained editor; closing the child restores focus inside the parent instead of returning to an unrelated page surface. The server converts these semantic browser fields into upstream tag/style fields from an authoritative avatar and freshly validates selected style names against the fixed VRChat style endpoint, so the browser cannot overwrite protected tag namespaces or supply arbitrary style IDs. Before every metadata mutation or deletion, the server independently re-fetches the authoritative avatar, verifies its ID and author against the active singleton identity, and accepts only a strict fixed field set. Successful updates replace the owner-scoped MongoDB avatar cache; deletion removes it. Local projection or encrypted-cookie persistence failure requests reconciliation without turning an already completed upstream mutation into a browser retry. Fallback and impostor actions likewise verify the Quest tag or author identity and stay confined to fixed avatar child endpoints. Regenerate intentionally attempts enqueue even when deletion fails, matching VRCX's `finally` sequence. Selecting an avatar uses the same fixed action route and never exposes the VRChat session to the browser.

Wear, make public/private, rename, change description, deletion, image editing, and impostor creation/maintenance use narrowly scoped VRChat routes shared with the maintained Avatar Dialog. View Details opens that dialog, while Change content tags and Change styles/author tags open their corresponding maintained child editors directly. VRCX Time Spent is intentionally omitted because it comes from local game logs; no synthetic duration is shown. The table preserves all other remotely available source columns and scrolls within its pane on narrow screens.

## Mutual Friends Scope

`VRCX/src/views/Charts/components/MutualFriends.vue`, `views/Charts/graphLayoutWorker.js`, `stores/charts.js`, and `services/database/mutualGraph.js` define the Mutual Friends graph, fetch state, settings, and persistence behavior. The web port keeps VRCX's fetch/stop states, processed-friend progress, friend navigator, avatar-backed colored nodes, curved edges, selection focus, pan/zoom camera, click-through user dialog, node context menu, single-friend refresh, hide action, empty state, and right-side layout settings. Iterations, spacing, edge curvature, community separation, and excluded friends are stored in the singleton MongoDB settings document.

Mutual fetching is a server-owned, rate-limited VRChat API job rather than a browser loop. MongoDB stores the last complete graph, opt-outs, job identity, target, status, progress, cancellation request, error, heartbeat, fixed sorted friend-ID worklist, and separate in-progress relationships/opt-outs. Closing the browser stops only client polling; the Node.js process continues the job. A cancelled or failed fetch leaves the previous complete graph intact, and a node refresh replaces only that friend's relationships. After a process interruption, the singleton monitor leader atomically claims a stale checkpoint after the two-minute heartbeat threshold and continues at the first incomplete friend without a browser request. Completed friends are not fetched again, while a process loss inside one friend's paged response restarts that friend's pages because individual upstream pages are not durable facts. Migration 27 marks pre-checkpoint interrupted jobs as non-resumable errors instead of pretending their old `jobProcessed` value has corresponding partial data.

The Sigma/Graphology/Louvain worker rendering pipeline is translated to a browser-safe React/SVG renderer so the root build does not depend on the reference checkout. It preserves the visible graph vocabulary and deterministic force layout, but very large-graph performance and community placement must still be compared against the running VRCX reference before visual parity is considered complete. Full fetches are intentionally operator-triggered, as in VRCX, because scanning every friend consumes rate-limited API calls; once triggered, they no longer depend on an open page.

## Hot Worlds and Instance Activity Scope

`VRCX/src/views/Charts/components/HotWorlds.vue`, its English localization, the Charts router/navigation constants, and `getHotWorlds` plus `getHotWorldFriendDetail` in `VRCX/src/services/database/feed.js` define Hot Worlds. The maintained `/charts/hot-worlds` route closely translates its 7/30/90-day selector, unique-friend-first ranking, visit counts, first-period/second-period rising and cooling comparison, two-column desktop list, single-column narrow list, proportional bars, summary counters, empty/loading/error states, world links, and right-side friend detail sheet. Search is unnecessary because VRCX does not expose one on this screen.

The server derives each visit from an owner-scoped friend `GPS` transition already persisted by the always-on monitor. It deliberately excludes the active identity, Online baselines, status events, malformed/private locations, and another retained identity, matching VRCX's friend-GPS query rather than turning every presence observation into a visit. The existing `owner_type_occurred` index supports all three bounded periods. Cached world names are joined at query time; when an old event has no resolvable cache entry, the canonical world ID remains visible instead of discarding the remotely observed fact as VRCX's nonempty-name SQL does. Counts therefore represent observed transitions, not unique local game launches, and private/unobservable visits cannot be recovered. The UI states this limitation and owns no durable chart data or settings.

Instance Activity is conclusively `Local-VRChat-only`. `VRCX/src/views/Charts/components/InstanceActivity.vue`, `InstanceActivityDetail.vue`, `useInstanceActivityData.js`, and `getInstanceActivity`/`getDateOfInstanceActivity` in `VRCX/src/services/database/gameLog.js` require local `gamelog_join_leave` `OnPlayerLeft` rows for the active identity and every co-present player. Those rows supply exact join/leave intervals, overlap, friend/favorite classification, solo/no-friend filters, and per-player detail. Remote APIs cannot observe an instance roster or those boundaries. Showing only the active identity's bounded `game_sessions` would duplicate Game Log while falsely presenting the defining occupancy chart, so the route, navigation item, settings, and detail controls remain absent.

## Settings Scope

`VRCX/src/views/Settings/Settings.vue`, `components/SettingsGroup.vue`, `components/SettingsItem.vue`, `components/Tabs/SystemTab.vue`, and `components/Tabs/InterfaceTab.vue` define the settings page hierarchy and dense card rows. The web port exposes the working System and Interface categories, VRCX-style underlined tabs and groups, application/version/legal links, theme, navigation collapse, favorite ordering, and the current per-workflow table page sizes. Changes write through the validated singleton MongoDB settings boundary and update the live shell where applicable.

Settings export produces a versioned JSON download containing only validated browser-safe application preferences. Import validates the exact format and rejects unknown or server-owned fields before replacing those preferences in MongoDB. VRChat cookies, active identity state, MongoDB configuration, monitor leases, histories, caches, and secrets are never included. Favorite ID/CSV transfer remains a separate, working Favorites workflow and is not mislabeled as part of this preferences backup; avatar-tag transfer remains future workflow work.

The pre-Mongo root prototype wrote exactly three durable browser keys: `vrcx-theme`, `vrcx-nav-collapsed`, and `vrcx-my-avatars-view`. Settings exposes a browser adaptation that explicitly detects and confirms only those valid historical values, atomically imports them once into the singleton MongoDB settings record, stores version/timestamp/key evidence, and then removes only the imported keys. Migration 25 initializes the durable one-time guard. Invalid and unrelated browser storage is ignored, and a concurrent or later import cannot overwrite the first result. This is intentionally separate from VRCX desktop SQLite/JSON import work.

`VRCX/src/views/Settings/components/Tabs/AdvancedTab.vue`, `stores/settings/advanced.js`, and `services/database/feed.js` define database cleanup. The port keeps VRCX's Off/30/90/180/365-day automatic setting, weekly per-identity guard, 180/365/730-day and all-data manual purge choices, destructive confirmation, backup warning, and Avatar Feed-only boundary. The always-on monitor checks once at startup and daily thereafter so a continuously running server still performs the weekly job. Cleanup deletes only owner-scoped `activity_events` whose type is `Avatar`; it never deletes GPS/status/presence, Friend Log, Game Log sessions, current projections, notifications, favorites, tags, memos, or another identity's records. A nested self Avatar row is the same activity record and therefore disappears from Game Log when purged, while its session remains intact. Migration 23 backfills the setting and adds the owner/type/time cleanup index. MongoDB does not require the SQLite VACUUM-and-desktop-restart sequence, so the web port reports the deleted count without restarting the server; physical storage reclamation remains a MongoDB operator concern.

VRCX's Windows startup, tray, GPU, updater, local proxy, VR, OpenVR, media/filesystem, local TTS condition, Discord/game-process integration, registry, and similar controls are absent instead of disabled because their behavior depends on the desktop or local VRChat. Eligible notification delivery and richer social preferences will be added only with their working browser/server behavior; empty tabs are not shown. The earlier Manage-menu link to the About placeholder has been replaced by the maintained `/settings` route, while the complete copied license remains available from its System legal section.

## Delivery Plan

### Milestone 0 — Rebaseline and Reference Capture

Status: In progress

- [x] Record the single-user, always-on, MongoDB, VRCX-parity direction in `AGENTS.md`, `PLANS.md`, and `README.md`.
- [ ] Inventory every VRCX route, navigation item, dialog, store, realtime event, API path, setting, and database method.
- [ ] Capture the running VRCX shell and key states at fixed desktop content viewport sizes.
- [x] Create and enforce a [difference register](docs/vrcx-route-difference-register.md) mapping every current root route to its VRCX source and visible deviations.
- [x] Confirm remote observation feasibility for all formerly local-derived charts and histories.
- [ ] Capture populated, current, historical, filtered, loading, and empty Game Log session reference states.
- [ ] Record exact exclusions without removing remotely derivable behavior.

Exit criteria: the scope inventory, visual fixtures, persistence map, and remote-source map are sufficient to prevent guesswork.

### Milestone 1 — MongoDB Foundation and Single-User State

Status: In progress

- [x] Add the MongoDB driver, validated environment configuration, connection lifecycle, health check, and test database strategy.
- [ ] Define versioned migrations, indexes, repository boundaries, retention, backup, and restore behavior.
- [x] Add a fail-closed, isolated `mongodump`/`mongorestore` proof covering documents, collection options, indexes, encrypted-session decryptability, source consistency, and cleanup.
- [x] Implement singleton settings and active-identity records.
- [x] Move the former root prototype's three durable browser preferences into MongoDB with an explicit one-time migration/import path.
- [x] Implement encrypted server-side VRChat session persistence with the key supplied outside MongoDB.
- [x] Add safe active-identity replacement that prevents cross-account data mixing.
- [x] Port VRCX's Avatar Feed retention setting, weekly server cleanup, manual purge confirmation, owner isolation, and cleanup index.

Exit criteria: the server restarts without losing authoritative application state, and no new durable product data is browser-owned.

### Milestone 2 — Always-On VRChat Monitor

Status: In progress

- [x] Port the currently eligible VRCX Pipeline event parsing for own location, notifications, and friend invalidation into typed server modules.
- [x] Implement startup baseline synchronization and paginated HTTP reconciliation for current user, friends, and notifications.
- [x] Add reconnect backoff, post-gap reconciliation, session-expiry recovery, and coordinated in-process rate limiting.
- [x] Add MongoDB-backed singleton leader leasing for multi-process safety.
- [x] Implement idempotent event writes, current-state projections, cursors, and derived-event provenance.
- [x] Record the active identity's own remote-observable activity through a dedicated baseline and show its Feed events in overlapping Game Log sessions.
- [x] Implement active-account location session opening, transition, bounded closing, and restart/gap reconciliation in `game_sessions`.
- [x] Expose monitor health and stream/reconciliation timestamps to the UI.
- [x] Cover browser-independent lease loss, disconnect, reacquisition, baseline reconciliation, and Pipeline reconnection with a deterministic monitor lifecycle test.
- [x] Add an isolated production-process acceptance harness that proves leader replacement, post-restart baseline completion, Pipeline reconnection, active-identity continuity, and cursor monotonicity without a browser request.
- [ ] Prove monitoring and restart recovery with no browser connected.

Exit criteria: one server monitor maintains recoverable remote state continuously and safely across disconnects and restarts.

### Milestone 3 — Exact VRCX Shell and Shared UI

Status: In progress

- [ ] Port VRCX theme variables, typography, icons, spacing, density, scrollbars, motion, and component-state styles.
- [ ] Recreate the VRCX layout, navigation, status bar, friend sidebar, menus, popovers, dialogs, and settings structure.
- [ ] Build shared React primitives only from observed VRCX patterns.
- [x] Remove navigation and settings entries for confirmed Local-VRChat-only and Dashboard features from the current shell.
- [ ] Add matched-viewport screenshot tests for the shell's significant states.
- [x] Add a deterministic MongoDB-backed capture harness for current-port Friends Locations, Feed, Friend Log, Friend List, User Dialog, Notifications, Game Log, Search, all three Favorites states, Moderation, My Avatars, Mutual Friends, and Settings states at 360, 768, 1280, and 1920 pixels.
- [ ] Verify narrow layouts without introducing a separate visual design.

Exit criteria: the root shell is visually indistinguishable from VRCX within documented browser rendering tolerances.

### Milestone 4 — Remote Workflows and History

Status: In progress

Port one complete VRCX workflow at a time in this order unless dependency discovery changes it:

1. Friends Locations, sidebar, and status surfaces.
2. Feed, Friend Log, remotely observed previous locations, and Game Log session view.
3. User dialogs, Friend List, search, and relationship actions.
4. Notifications and responses.
5. Favorites, memos, tags, and organization.
6. Moderation and My Avatars.
7. Mutual graph and eligible server-derived charts, excluding Dashboard.
8. Remaining remote-backed dialogs, settings, import/export, and tools.

For every slice:

- [ ] Record exact VRCX source, remote inputs, Pipeline events, and persistence mapping.
- [ ] Implement repository/service behavior and monitor projections before the UI depends on them.
- [ ] Match all VRCX states and interactions at the reference viewport.
- [ ] Add responsive, keyboard, and touch behavior without redesigning the screen.
- [ ] Add transformation, persistence, action, recovery, and high-value UI tests.
- [ ] Record unavoidable differences and authenticated verification evidence.

Exit criteria: each eligible workflow is durable, continuously updated, tested, and visually faithful end to end.

### Milestone 5 — Migration, Hardening, and Release

Status: Planned

- [ ] Provide migrations for current root browser data and supported VRCX exports without requiring `./VRCX/` at runtime.
- [x] Provide the one-time migration for every durable browser key found in the former root prototype.
- [x] Accept and validate the browser-compatible VRCX Favorites, friend-list, and owned-avatar CSV ID exports without runtime access to `./VRCX/`.
- [ ] Test prolonged operation, rate limits, upstream outages, malformed events, session expiry, MongoDB interruption, process restart, and lease failover.
- [ ] Audit route allowlists, XSS, CSRF, request forgery, cache behavior, secrets, encryption, logging, and accidental public exposure.
- [x] Audit and harden VRChat entity-ID validation across route parameters, mutation bodies, stored settings, location parsing, and the upstream endpoint allowlist.
- [x] Audit every GET API response and enforce an explicit `no-store` cache policy with an all-route regression inventory.
- [x] Audit all API mutation handlers and enforce shared same-origin Fetch Metadata/Origin checks with an all-route regression inventory.
- [x] Add a production CSP and cross-origin browser headers, remove unused Server Actions origins, keep client modules free of raw HTML execution and secret environment access, and bind the default production command to loopback.
- [x] Restrict every HTML and SVG remote-media load to VRCX's three authoritative VRChat origins while retaining scheme-checked explicit external links.
- [x] Centralize structural secret redaction for operator harness output and prevent direct diagnostic writes from production application modules.
- [ ] Verify MongoDB backup/restore and retention/cleanup workflows.
- [x] Verify the isolated backup/restore mechanism with MongoDB Database Tools 100.17.0 and retain automated fingerprint coverage.
- [ ] Complete keyboard, focus, labels, contrast, reduced-motion, touch, and responsive audits.
- [ ] Complete matched-state VRCX visual comparisons for every shipped screen.
- [ ] Run the full test, lint, production build, and authenticated operator smoke suite.
- [ ] Confirm attribution, deployment, monitoring, recovery, and known-difference documentation.

Exit criteria: the application is suitable for continuous single-user private deployment and meets the global definition of done.

## Cross-Cutting Acceptance Checklist

- [ ] Exact VRCX source files and running behavior were inspected.
- [ ] Remote inputs, realtime events, reconciliation rules, and observation limits are documented.
- [ ] Durable state is validated and stored in MongoDB with required indexes and migrations.
- [ ] Ingestion and actions are idempotent, recoverable, and rate-limit aware.
- [ ] The feature works after server restart and without a browser open when monitoring is involved.
- [ ] Local-VRChat-only behavior is excluded without dead controls.
- [ ] Game Log contains only the faithful session presentation and never fabricates local-log events or exact process-lifetime boundaries.
- [ ] Desktop screenshots and interaction states match VRCX at the same content viewport.
- [ ] Narrow layouts remain usable and recognizably VRCX.
- [ ] Keyboard, touch, focus, loading, empty, error, disabled, unread, and stale states work.
- [ ] External and stored data are typed and validated at their boundaries.
- [ ] Secrets and session data do not leak to logs, client state, or unencrypted storage.
- [ ] Relevant tests, `pnpm lint`, and `pnpm build` pass.
- [ ] Provenance, differences, and plan status are current.
- [ ] The change is committed as a small, focused English commit.

## Decision Log

### 2026-08-02 — Make VRCX UI Parity the Acceptance Standard

Decision: Replace the current root web design wherever it differs from VRCX and require matched-state, matched-viewport visual comparison.

Rationale: The product is a port of VRCX, not a VRCX-inspired website.

Consequence: Framework defaults and existing root components have no compatibility priority. Differences require correction or explicit documentation.

### 2026-08-02 — Monitor VRChat Continuously on the Server

Decision: Move observation out of browser refresh cycles into an always-running server monitor that uses the VRChat Pipeline and scheduled HTTP reconciliation.

Rationale: VRCX-like history must continue to accumulate while the UI is closed and must survive browser and server restarts.

Consequence: Persistent Node.js hosting is required. Serverless/scale-to-zero deployment is unsupported, and monitor leadership, retry, reconciliation, health, and rate-limit behavior become core product requirements.

### 2026-08-02 — Use MongoDB for All Durable Application Data

Decision: Replace VRCX SQLite/JSON persistence and the root prototype's browser storage with MongoDB repositories.

Rationale: One server-owned database is needed for continuous monitoring, history, settings, recovery, and consistent UI state.

Consequence: Every feature requires a collection/index/migration mapping. Durable data may not be added to browser storage, JSON files, or process memory.

### 2026-08-02 — Support One Operator and One Active VRChat Identity

Decision: Optimize the entire deployment for one trusted operator and one monitored VRChat account.

Rationale: Multi-user accounts, tenancy, and authorization would add complexity outside the intended deployment.

Consequence: Settings, monitor state, and retained session are singletons. Switching VRChat identities must be explicit and must prevent data mixing.

### 2026-08-02 — Exclude Features That Require Local VRChat

Decision: Do not require a local VRChat installation, process, logs, files, or desktop/VR integrations. Reconsider formerly excluded history and charts only when the same user-visible result can be derived truthfully from remote observation.

Rationale: The server should reproduce VRCX as closely as possible through VRChat APIs, not by coupling deployment to the game workstation.

Consequence: Game Log session mode is required from remote location observations, while its flat table and local-only event rows remain omitted. Photon Player List, Gallery, OpenVR, Steam/process, OSC, IPC, registry, Electron window/tray, and similar functionality also remain omitted. Remote-derived data must disclose its observation limits.

### 2026-08-02 — Implement Game Log Only as Remote-Derived Sessions

Decision: Include Game Log in production navigation and reproduce VRCX's sessions UI, but do not implement its flat table mode. Populate every session fact available through remote VRChat APIs and MongoDB history.

Rationale: Continuous API monitoring can produce useful VRCX-style location sessions without requiring the local game, but it cannot truthfully reproduce the raw local-log event stream.

Consequence: The page reuses or closely translates the VRCX session components and interactions. It shows observed location/world/group, bounded timing, duration/current state, search, date filtering, and incremental history. The table switch, player join/leave, portal, video, resource, external, and arbitrary local event UI are absent.

### 2026-08-02 — Exclude Dashboard

Decision: Do not port the VRCX Dashboard, including remotely reproducible widgets.

Rationale: Dashboard is outside the requested product scope.

Consequence: Remove the existing prototype Dashboard route and navigation entry during implementation. Its widgets do not need parity work and must not be shown as placeholders elsewhere.

### 2026-08-02 — Run Mutual Graph Fetches as Durable Server Jobs

Decision: Preserve VRCX's operator-triggered Mutual Friends fetch, but execute it entirely on the persistent server and keep its state in MongoDB.

Rationale: Mutual discovery is a large, rate-limited HTTP scan. It must continue after the initiating browser closes and must never replace a valid graph with an interrupted partial result.

Consequence: The browser starts, observes, or cancels a fixed-purpose job; it does not loop over VRChat endpoints. MongoDB retains the last complete snapshot and separate job progress. Node context refresh targets one friend. Process termination is detected by heartbeat expiry, after which a new request safely restarts the work.

### 2026-08-02 — Keep the Deployment Private Without Custom Application Auth

Decision: Do not add application accounts or authorization. Protect the deployment through trusted-network operations while keeping VRChat authentication and secrets server-side.

Rationale: Only one operator uses the server.

Consequence: Private HTTPS deployment remains mandatory guidance, and normal XSS, CSRF, credential, proxy, and accidental-exposure protections still apply.

## Historical Verification

Before this rebaseline, the browser-session prototype passed its existing unit tests, Biome check, Next.js production build, anonymous redirect smoke test, security-header check, and cross-site mutation rejection. That evidence remains useful for unchanged low-level code but does not establish MongoDB, always-on monitoring, or VRCX visual parity.

The 2026-08-02 documentation rebaseline passed `pnpm test` (5 files, 13 tests), `pnpm lint` (74 files), and `pnpm build` (28 generated routes).

Authenticated VRChat behavior, long-running monitoring, restart recovery, MongoDB migrations, and matched-state VRCX screenshots remain required operator checks as those systems are implemented.

The 2026-08-02 MongoDB visual-fixture increment passed `pnpm test` (7 files, 23 tests), `pnpm lint` (108 files), and `pnpm build` (21 generated pages). Friends Locations and Game Log were rendered from synthetic MongoDB projections at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow. This found and fixed a status-clock hydration mismatch and narrow-layout clipping. The later Feed, Friend Log, Friend List, and User Dialog ports extended the same fixture to those screens and again passed all four overflow checks. Running-VRCX reference comparisons and authenticated operator smoke tests remain outstanding.

The 2026-08-02 monitor-failover increment passed `pnpm test` (8 files, 26 tests), `pnpm lint` (109 files), and `pnpm build` (21 generated pages). Automated coverage now proves that a monitor with no browser connected closes its Pipeline socket when it loses the MongoDB lease, then performs a new HTTP baseline before reconnecting after lease reacquisition. A live authenticated process-restart soak remains an operator acceptance item.

The 2026-08-02 Mutual Friends increment passed `pnpm test` (9 files, 33 tests), `pnpm lint` (120 files), and `pnpm build` (24 generated pages). The populated graph passed deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow; the narrow settings sheet also passed an interaction smoke check. Live authenticated API scanning, very-large-graph comparison, and a forced process-termination recovery soak remain operator acceptance items.

The 2026-08-02 Settings increment passed `pnpm test` (10 files, 36 tests), `pnpm lint` (125 files), and `pnpm build` (25 generated pages). System and Interface states passed deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow. A fixture-backed export/import round trip returned a versioned attachment and restored validated MongoDB preferences; unknown and server-owned fields have automated rejection coverage.

The 2026-08-02 Favorites transfer increment passed `pnpm test` (11 files, 38 tests), `pnpm lint` (128 files), and `pnpm build` (25 generated pages). Import and export dialogs passed deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow. A browser interaction smoke test resolved a cached friend through the fixed user route, imported it into a MongoDB local group, reloaded Favorites, and verified both retained members. ID type filtering and CSV injection neutralization have automated coverage. Authenticated imports into live VRChat favorite groups remain an operator smoke test.

The 2026-08-02 World Dialog increment passed `pnpm test` (11 files, 38 tests), `pnpm lint` (129 files), and `pnpm build` (25 generated pages). A populated deterministic World Dialog fixture and four-width capture case were added. Capture execution in the current workspace was blocked before page launch because the installed Chromium binary lacks its system shared libraries and the unprivileged Playwright dependency installer cannot add them; responsive overflow and matched-state visual comparison therefore remain outstanding rather than being reported as passed.

The 2026-08-02 Group Dialog core increment passed `pnpm test` (11 files, 38 tests), `pnpm lint` (131 files), and `pnpm build` (25 generated pages). A populated deterministic Group Dialog fixture and four-width capture case were added, but the same unavailable Chromium shared libraries prevent reporting that capture as passed. Authenticated refresh and the remaining remote-compatible group tabs/actions remain follow-up acceptance work.

The 2026-08-02 Group Posts and Members increment passed `pnpm test` (11 files, 39 tests), `pnpm lint` (134 files), and `pnpm build` (25 generated pages). Automated integration coverage verifies the new migration plus owner isolation, complete post replacement, inactive post retention, and member-page persistence. Populated Posts and Members capture states were registered, but Chromium cannot launch in the current unprivileged workspace, so responsive screenshot evidence remains outstanding.

The 2026-08-02 Avatar Dialog core increment passed `pnpm test` (11 files, 39 tests), `pnpm lint` (135 files), and `pnpm build` (25 generated pages). A populated cross-platform Avatar Dialog capture state was registered, but responsive capture remains blocked by the workspace's missing Chromium libraries. Authenticated refresh and avatar selection, plus matched-state comparison against running VRCX, remain operator checks.

The 2026-08-02 entity memo increment passed `pnpm test` (11 files, 40 tests), `pnpm lint` (138 files), and `pnpm build` (25 generated pages). Integration coverage verifies migration 21, owner isolation, trimming, replacement, and empty-value deletion. Synthetic user, world, and avatar memo records now exercise all three dialog fields; interaction capture remains blocked by the unavailable Chromium runtime dependencies.

The 2026-08-02 User Dialog relationship and note increment passed `pnpm test` (11 files, 41 tests), `pnpm lint` (140 files), and `pnpm build` (25 generated pages). Integration coverage verifies that relationship and note mutations update both owner-scoped user caches without crossing identity boundaries. Live request, accept, cancel, unfriend, and note mutation checks still require an authenticated operator session; responsive interaction capture remains blocked by the unavailable Chromium runtime dependencies.

The 2026-08-02 Group membership actions increment passed `pnpm test` (11 files, 42 tests), `pnpm lint` (141 files), and `pnpm build` (25 generated pages). Integration coverage verifies owner-scoped membership projection changes, while the production build includes the fixed group-action route. Live join, request, cancel, representation, subscription, visibility, leave, block, and unblock checks remain authenticated operator acceptance work; responsive interaction capture remains blocked by the unavailable Chromium runtime dependencies.

The 2026-08-08 dialog favorite-action increment passed `pnpm test` (11 files, 42 tests), `pnpm lint` (142 files), and `pnpm build` (25 generated pages). User, World, and Avatar dialogs now reproduce VRCX's current-group removal and available-group addition behavior for VRChat favorites, plus independent toggles for MongoDB-local groups. The chooser supports Escape, restores focus, and retains its complete layout at 360, 768, 1280, and 1920 pixels. Twelve deterministic screenshots passed the page-overflow gate after the capture harness gained optional `VRCX_VISUAL_WIDTHS` selection; representative narrow and desktop images were manually inspected for dialog clipping and stacking. Live authenticated VRChat add/remove remains an operator smoke test, and these current-port captures do not replace matched running-VRCX comparison.

The 2026-08-08 monitor idempotency increment passed `pnpm test` (11 files, 44 tests), `pnpm lint` (143 files), and `pnpm build` (25 generated pages). Friend transitions now use deterministic relationship-epoch keys shared by Pipeline ingestion and HTTP reconciliation, write history before advancing the snapshot projection, and protect friend/user projections from stale writers with version comparisons. Pipeline handling and reconciliation are serialized within the leader, while migration 22 adds an identity-scoped local commit sequence, event type, payload hash, and observation time that advance only after successful normalized processing. Automated coverage exercises duplicate and cross-source retry convergence, stale cache rejection, cursor ownership, active-identity reset, and periodic reconciliation waiting for an in-flight Pipeline write. The upstream Pipeline still offers no replayable cursor, so HTTP reconciliation remains the recovery mechanism after a process gap; a live authenticated forced-termination soak with no browser connected remains an operator acceptance item.

The 2026-08-08 monitor restart-harness increment passed `pnpm test` (12 files, 51 tests), `pnpm lint` (145 files), and `pnpm build` (25 generated pages). `pnpm monitor:restart-smoke` now owns two consecutive built Next.js server processes, waits for durable baseline and Pipeline evidence without issuing a browser request, force-kills the first process, and requires a different leader to recover the same identity without cursor regression. Its evidence predicate rejects stale or expired leader, identity, baseline, connection, and sequence state, and the CLI fails closed before spawning when required secrets are absent. The harness was not run against a live authenticated VRChat session in this workspace, so the final no-browser restart acceptance checkbox remains open until an isolated operator run succeeds.

The 2026-08-08 Avatar Feed cleanup increment passed `pnpm test` (12 files, 52 tests), `pnpm lint` (147 files), and `pnpm build` (26 generated pages). It ports VRCX's automatic and manual Avatar Feed purge choices to an owner-scoped MongoDB deletion, adds the weekly always-on monitor guard and cleanup status, and preserves all non-Avatar activity and Game Log sessions. The destructive confirmation passed a 360-pixel Chromium capture with Escape and focus-restoration smoke coverage; matched running-VRCX comparison and a production backup-and-purge operator drill remain outstanding.

The 2026-08-08 self-activity increment passed `pnpm test` (12 files, 55 tests), `pnpm lint` (148 files), and `pnpm build` (26 generated pages). Migration 24 adds an owner-unique `self_snapshots` baseline, and both Pipeline `user-update`/`user-location` ingestion and HTTP reconciliation now persist the active identity's non-relationship changes through the same deterministic `activity_events` path used for friends. Integration coverage verifies first-observation suppression, duplicate retry safety, isolation from the friend projection, GPS/Offline session-boundary association, and pagination-boundary deduplication. Synthetic self Status and Avatar events were manually inspected in Feed and nested Game Log rows at 360, 768, 1280, and 1920 pixels after all eight captures passed the page-overflow gate; the updated purge dialog also passed its 360-pixel interaction capture. Live authenticated self status/avatar/location changes and matched running-VRCX comparison remain operator checks.

The 2026-08-09 MongoDB recovery-proof increment passed `pnpm test` (13 files, 57 tests), `pnpm lint` (150 files), and `pnpm build` (26 generated pages). It also exercised MongoDB Database Tools 100.17.0 against an isolated in-memory server: a compressed archive containing three collections, three representative documents, ordered indexes, an empty indexed collection, BSON dates, and an AES-256-GCM VRChat session was restored to a generated namespace, fingerprinted byte-for-byte at the BSON Extended JSON boundary, decrypted with the retained key, and automatically removed. Automated coverage separately rejects unsafe database names and detects document or index mismatches. A production archive retention drill and deliberate restore under the operator's actual MongoDB authentication/topology remain open, so the broad release-hardening item is not marked complete.

The 2026-08-09 legacy-browser-settings increment passed `pnpm test` (14 files, 61 tests), `pnpm lint` (154 files), and `pnpm build` (27 generated pages). Git history inspection confirmed the three-key migration boundary. Automated coverage verifies exact historical parsing, malformed and unrelated storage isolation, imported-key cleanup, migration 25, MongoDB evidence, and atomic first-import-wins behavior. A fixture-backed HTTP proof returned 200 for the first three-value import, 409 for a conflicting second import, and retained the first MongoDB values. A later browser proof at 360 and 1280 pixels accepted the exact confirmation, persisted light theme, collapsed navigation, and table-mode My Avatars settings to MongoDB, removed only the three recognized historical keys, retained unrelated browser storage, rendered the success state, and had no page-level horizontal overflow. Browser-compatible VRCX export handling is classified and verified in the following increment.

The 2026-08-09 VRCX CSV compatibility increment passed `pnpm test` (14 files, 62 tests), `pnpm lint` (154 files), and `pnpm build` (27 generated pages). Regression fixtures are taken from the five eligible VRCX export layouts and cover headers appearing at either end of the CSV, kind isolation, deduplication, and malformed UUID rejection. Favorites now labels a recognized VRCX CSV before processing, bounds file input to 1 MB, and reports file-read failures without issuing upstream requests. Actual item resolution, MongoDB local-group import, remote capacity enforcement, cancellation, and CSV formula neutralization remain covered by the existing Favorites workflow. Registry backup remains explicitly local-only, and no nonexistent general VRCX export format is claimed.

The 2026-08-09 focused browser-runtime recovery extracted the required Ubuntu Chromium libraries into a temporary directory without installing system packages or adding repository artifacts. Settings and the empty Favorite Friends import dialog passed deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow; representative narrow and desktop images were manually inspected. The populated VRCX `UserID,Name` detection state additionally passed at 360 and 1280 pixels, rendered `VRCX CSV detected · 1 unique friend ID`, and retained exact viewport width. This resolves the workspace runtime blocker for these focused states, but does not retroactively establish the still-unrun dialog captures above or replace matched-state comparison with a running VRCX application.

The 2026-08-09 entity-ID hardening increment passed `pnpm test` (15 files, 65 tests), `pnpm lint` (156 files), and `pnpm build` (27 generated pages). The audit replaced every permissive `[0-9a-f-]{36}` check in root source: 26 API input boundaries, both Game Log world/group extractors, and 15 variable upstream endpoint patterns now require canonical UUID separator positions. Shared Zod schemas cover reusable mutation, setting, memo, favorite, and tag bodies; regression tests reject missing, repeated, misplaced, and trailing separators and prove that malformed IDs cannot match the fixed-host upstream allowlist. The broader XSS, cache, logging, deployment-exposure, and remaining security checklist stays open.

The 2026-08-09 API cache-policy audit passed `pnpm test` (16 files, 66 tests), `pnpm lint` (157 files), and `pnpm build` (27 generated pages). All 29 GET route handlers already set `Cache-Control` to `no-store` or `private, no-store`; auth/session, health, settings, monitor, history, cache, search, favorite, memo, and entity responses are therefore not reusable by browsers or intermediary caches. The new source inventory fails when a GET route is added without an explicit policy. This increment deliberately inventories GET handlers; mutation responses and broader framework, reverse-proxy, and deployment cache behavior remain in the open security audit.

The 2026-08-09 CSRF route audit passed `pnpm test` (16 files, 67 tests), `pnpm lint` (157 files), and `pnpm build` (27 generated pages). All 31 POST, PUT, PATCH, and DELETE handlers across 24 route files call the shared same-origin guard before processing input or contacting VRChat. Existing behavioral tests cover same-origin proxy deployments, internal proxy hosts, Origin fallback, and cross-site Fetch Metadata rejection; the new source inventory fails when a mutation handler is introduced without the guard. Non-browser operator requests without Fetch Metadata or Origin remain an intentional trusted-private-deployment behavior, not evidence of a public authorization layer.

The 2026-08-09 browser security-boundary increment passed `pnpm test` (17 files, 72 tests), `pnpm lint` (159 files), and `pnpm build` (27 generated pages). Every route now receives a production CSP plus opener/resource/referrer/permissions/content-type/frame and DNS-prefetch headers; production excludes `unsafe-eval`, browser connections and scripts remain same-origin, and frame/object embedding is denied. Source inventory rejects raw HTML execution primitives or server-secret environment access in client modules, while the MongoDB integration test proves that literal auth and two-factor cookies are absent from the stored encrypted-session document. The unused external Server Actions origin list was removed. `pnpm start` now uses the supported non-standalone build and binds to `127.0.0.1`; a production HTTP smoke returned the full header set on loopback and refused the host-interface address. The broad security checklist remains open for the remaining logging/error-redaction, dependency, reverse-proxy, TLS, and authenticated deployment review.

The 2026-08-09 remote-media request-forgery increment passed `pnpm test` (18 files, 87 tests), `pnpm lint` (162 files), and `pnpm build` (27 generated pages). The VRCX reference's three preconnected media origins now form one shared URL boundary used by every HTML and SVG image surface; HTTPS lookalikes, alternate ports, embedded credentials, private hosts, active schemes, relative URLs, and unrelated origins are rejected. A source inventory fails if a raw media element bypasses the shared component. Explicit external HTTP(S) links remain scheme-checked and no-referrer, while an external notification image is no longer fetched automatically. A production HTTP smoke confirmed that CSP `img-src` contains only self/data/blob plus the same three VRChat origins. This narrows browser request forgery without claiming that the broader security or matched-VRCX acceptance work is complete.

The 2026-08-09 operator-log redaction increment passed `pnpm test` (19 files, 103 tests), `pnpm lint` (164 files), and `pnpm build` (27 generated pages). Backup and monitor-restart harnesses now share one structural redactor for exact configured secrets, URI userinfo, Basic/Bearer authorization, VRChat auth and two-factor cookies in header, JSON, or inspected-object form, secret environment assignments, and token-like query parameters. Regression cases prove that useful host/timing diagnostics remain while the sensitive values disappear, and a source inventory requires both harnesses to redact every stderr write and captured child-process failure. Production application modules continue to emit no direct console or process-stream diagnostics; monitor health remains generic and durable in MongoDB. Framework, reverse-proxy, container-runtime, and dependency logging still require deployment-specific review, so the broad security audit remains open.

The 2026-08-09 dependency-security increment passed `pnpm install --frozen-lockfile`, `pnpm dependencies:audit` with no known production or development vulnerabilities, `pnpm dependencies:licenses`, `pnpm test` (19 files, 103 tests), `pnpm lint` (164 files), and `pnpm build` on Next.js 16.3.0 (27 generated pages). Updating Next.js from 16.2.12 removed vulnerable transitive Sharp and PostCSS releases; the workspace override advances Next.js/PostCSS's remaining Nano ID resolution from 3.3.16 to the minimum patched 3.3.17. The exact pnpm 11.18.0 package-manager release and its Node.js 22.13 runtime floor are now declared, and release instructions include frozen installation, vulnerability audit, and shipped-package license inventory. The production inventory contains no unknown or unlicensed package; redistribution packaging must preserve the listed notices, including libvips's LGPL terms. Reverse-proxy, TLS termination, container-runtime, and authenticated live-deployment review remain outside this dependency increment, so the broad security audit remains open.

The 2026-08-09 Previous Instances increment passed `pnpm test` (20 files, 108 tests), `pnpm lint` (169 files), and `pnpm build` on Next.js 16.3.0 (28 generated pages). Repository coverage verifies first-GPS prior-location recovery, current-row truthfulness, private/unobservable exclusion, active-account session projection, exact-location world/group aggregation, bounded duration totals, owner isolation, migration 26, and its query indexes; the all-route cache inventory now covers 30 GET handlers. The MongoDB-backed User, World, and Group variants each passed Escape/focus restoration and deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow, and representative narrow/desktop images were manually inspected. VRCX's local launch, delete, and player-info actions are deliberately absent, remote timing is visibly marked `Observed`, and a matched-state comparison with a running VRCX application plus authenticated live-history smoke remain open.

The 2026-08-09 Hot Worlds increment passed `pnpm test` (21 files, 112 tests), `pnpm lint` (175 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); the cache-policy inventory now covers 31 GET handlers. Pure and MongoDB integration coverage verifies VRCX's unique-friend/visit ordering, floored half-period trend boundaries, latest observed display names, malformed and expired event exclusion, owner isolation, active-identity exclusion, type isolation, cached world names, and friend detail ordering on the existing owner/type/time index. The populated ranking and detail sheet each passed deterministic captures at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow; the detail interaction also passed Escape and focus restoration, and representative narrow/desktop images were manually inspected. This evidence resolves Charts feasibility: Hot Worlds is remotely derived, while Instance Activity is excluded because its defining all-player occupancy intervals remain local-log-only. A matched-state comparison with a running VRCX application and authenticated live GPS accumulation remain open.

The 2026-08-09 Friend List Note/Memo search increment passed `pnpm test` (22 files, 116 tests), `pnpm lint` (177 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages). Pure coverage fixes the VRCX default field set, Note/Memo matching, explicit-field isolation, opt-in User Name behavior, and browser-boundary validation. MongoDB integration coverage verifies batched memo lookup, entity-type isolation, deduplication, and active-owner isolation. A fixture-backed HTTP smoke confirmed that the Friend List response combines a cached VRChat note and the active owner's private memo without exposing another identity's metadata. Note and Memo filtered capture states are registered at 360, 768, 1280, and 1920 pixels, but this run's Playwright Chromium again lacked `libglib-2.0.so.0`, so those screenshots and a matched-state running-VRCX comparison remain open rather than being claimed as passed.

The 2026-08-09 Mutual Friends restart-resume increment passed `pnpm test` (22 files, 117 tests), `pnpm lint` (177 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages). Migration 27 introduces resumable worklist and partial-result semantics without exposing partial graphs. MongoDB integration coverage proves stale-only atomic claim, owner isolation, retained cursor/worklist, and preservation of the last published snapshot; monitor lifecycle coverage proves that the authenticated singleton leader attempts recovery without a browser request. A live authenticated process kill during a large mutual scan remains an operator smoke test, and the at-most-one repeated incomplete friend's pages remain the documented recovery boundary.

The 2026-08-09 route difference-register increment passed `pnpm test` (23 files, 119 tests), `pnpm lint` (179 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages). It inventories every shipped page, its production navigation path, exact VRCX source, current eligibility state, intentional differences, and missing acceptance evidence in `docs/vrcx-route-difference-register.md`. An automated filesystem check fails if a page is undocumented or duplicated, if a product page is unreachable from the shell, or if a linked root/VRCX source disappears. The audit also corrected non-browser route drift: `/` now redirects to Feed, Friends Locations uses `/friends-locations`, Favorites use VRCX's `/favorites/*`, and My Avatars uses `/my-avatars`. A fixture-backed HTTP smoke returned 307 with `Location: /feed` for `/` and 200 with the Friends Locations title for its dedicated route. The build initially found ignored `.next/dev/types` entries for the moved routes; moving that regenerable cache to `/tmp` and rebuilding proved the maintained route graph cleanly.

The 2026-08-09 remote Group Dialog instances increment passed `pnpm test` (24 files, 123 tests), `pnpm lint` (182 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); the cache-policy inventory now covers 32 GET handlers. Schema and MongoDB integration coverage verifies required instance/world fields, canonical location/group/world matching, invalid count rejection, migration 28 and its indexes, complete and empty snapshot replacement, inactive-membership cleanup, upstream timestamp retention, and owner isolation. The always-on monitor obtains the aggregate snapshot without a browser, while its VRCX-aligned transient rate-limit handling retains the previous complete data. A fixture HTTP smoke returned the remote instance with `Cache-Control: private, no-store`, including a world/player count for an instance containing no visible friend. After the required Chromium libraries, fontconfig configuration, and Liberation fonts were extracted into an uncommitted temporary directory, the populated dialog passed registered 360- and 1280-pixel captures with no page-level horizontal overflow; both states were manually inspected for the remote world, instance name, player/capacity chip, narrow full-screen hierarchy, and desktop dialog bounds. A matched running-VRCX comparison and authenticated aggregate/dialog endpoint smoke remain open.

The 2026-08-09 Group Dialog calendar increment passed `pnpm test` (25 files, 127 tests), `pnpm lint` (186 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); source inventories now cover 33 GET handlers and 32 mutation handlers across 25 route files. Pure coverage fixes VRCX's `endsAt` boundary, chronological ordering, per-partition series deduplication, and partial follow-response contract, while MongoDB integration verifies migration 29, indexes, complete/empty replacement, follow-state update, missing-event behavior, and owner isolation. A fixture HTTP smoke returned two cached events with upstream pagination metadata and `private, no-store`; the upcoming event retained `userInterest.isFollowing=true`. Populated upcoming/past calendar states passed registered 360- and 1280-pixel captures with no page-level horizontal overflow after the temporary Chromium runtime was reused, and both screenshots were manually inspected for card sizing, fallback banners, share/follow states, narrow scrolling, and desktop dialog bounds. Live list/detail/follow requests, `.ics` download, and matched running-VRCX comparison remain open.

The 2026-08-09 Group Dialog Photos increment passed `pnpm test` (26 files, 131 tests), `pnpm lint` (189 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); the cache-policy inventory now covers 34 GET handlers. Schema and pure coverage verifies canonical gallery/image IDs, required render fields, absolute image URLs, cross-gallery rejection, and page deduplication, while MongoDB integration verifies migration 30, indexes, complete/empty replacement, truncation metadata, and owner isolation. A fixture HTTP smoke returned two cached galleries and three images with `private, no-store`. The populated Photos tab passed registered 360- and 1280-pixel captures with no page-level horizontal overflow; both were manually inspected for VRCX's nested tabs, restriction dots, counts, descriptions, grid sizing, narrow scrolling, and desktop dialog bounds. At both widths the fullscreen preview opened, trapped focus, closed with Escape, and restored focus to its image button. An authenticated live pagination/refresh smoke and matched running-VRCX comparison remain open.

The 2026-08-09 Group Calendar `.ics` increment passed `pnpm test` (28 files, 136 tests), `pnpm lint` (193 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); the cache-policy inventory now covers 35 GET handlers. Automated coverage verifies bounded calendar-envelope validation, byte preservation, binary/oversize rejection, canonical event IDs, the exact `.ics` allowlist boundary, authenticated text response decoding without regressing JSON, rotated cookies, and attachment cache policy. The expanded event card passed updated 360- and 1280-pixel captures with no page-level horizontal overflow; both were manually inspected, and Playwright confirmed that the Blob download fires with `evt_visual_upcoming.ics` at both widths. An authenticated live VRChat calendar-file response and matched running-VRCX comparison remain open; native OS calendar association remains a documented browser constraint.

The 2026-08-09 Group Dialog post-mutation increment passed `pnpm test` (29 files, 140 tests), `pnpm lint` (196 files), and `pnpm build` on Next.js 16.3.0 (29 generated pages); the same-origin inventory now covers 35 mutation handlers across 27 route files. Boundary coverage verifies canonical group-post/role/file IDs, exact child-post allowlisting, strict create/edit body differences, duplicate-role rejection, response ownership, and authoritative `myMember.permissions`/group-role checks. MongoDB integration verifies migration 31 and its indexes, authoritative empty snapshots, replacement/inactivation, create/edit projection upsert, and owner isolation. A fixture HTTP smoke returned the two cached posts with `private, no-store`. Mock-upstream browser runs at 360 and 1280 pixels inspected the exact create/edit payloads, executed immediate list replacement/removal, verified modal focus/Escape restoration, and captured create, edit, and delete-confirmation states without page-level horizontal overflow; all six screenshots were manually inspected. Upstream-success/local-projection-failure responses deliberately remain successful and request reconciliation, preventing a duplicate create retry against VRChat's non-idempotent endpoint. Authenticated live create/edit/delete, personal VRC+ Gallery image selection/upload, and matched running-VRCX comparison remain open.

The 2026-08-09 personal VRC+ Gallery increment passed `pnpm test` (30 files, 144 tests), `pnpm lint` (200 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); inventories now cover 36 GET handlers and 36 mutation handlers across 28 mutation route files. Automated coverage verifies multipart boundary preservation, exact `files`/`file/image` allowlisting, canonical file IDs, owner/tag isolation, and non-selectability of deleted or unfinished versions. MongoDB integration verifies migration 32, complete/empty snapshots, upload insertion, missing-snapshot truthfulness, indexes, and owner isolation. A fixture HTTP read returned two cached personal Gallery files with `private, no-store`. The nested picker passed registered 360- and 1280-pixel captures without page-level horizontal overflow; both screenshots were manually inspected for VRCX's toolbar/count, VRChat+-enabled upload, `200px` tiles, narrow scrolling, desktop bounds, and layered post editor, while Playwright verified initial focus, Escape, and return focus. An authenticated live `files` read and multipart upload plus matched running-VRCX comparison remain open.

The 2026-08-09 Group Dialog invitation increment passed `pnpm test` (31 files, 146 tests), `pnpm lint` (204 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); the same-origin inventory now covers 37 mutation handlers across 29 mutation route files. Strict boundary coverage verifies canonical, unique, bounded friend IDs and exact child-invite allowlisting. The server independently checks the authoritative `group-invites-manage` permission, sends the selected invitations sequentially, stops at the first failure, reports partial success, and avoids retry semantics after any non-idempotent upstream success. Mock-upstream browser runs at 360 and 1280 pixels exercised selection, confirmation, submission, Escape/return focus, confirmation focus, and focus trapping; both populated screenshots were manually inspected and had no page-level horizontal overflow. An authenticated live invitation and matched running-VRCX comparison remain open.

The 2026-08-17 Group Moderation Members increment passed `pnpm test` (32 files, 150 tests), `pnpm lint` (207 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); the same-origin inventory now covers 38 mutation handlers across 30 mutation route files. Boundary coverage verifies strict action bodies, canonical group/user/role endpoints, action-specific authoritative permissions, group-owned roles, and membership-removing action classification. MongoDB integration verifies owner-isolated member deactivation. Deterministic 360- and 1280-pixel captures exercised permission-gated opening, initial focus, focus trapping, Escape/return focus, member selection, the dense table, and the bulk-action area without page-level horizontal overflow; both screenshots were manually inspected. Bans, Invites, and Logs tabs, authenticated live mutations, and a matched running-VRCX comparison remain open.

The 2026-08-17 Group Moderation Bans increment passed `pnpm test` (33 files, 152 tests), `pnpm lint` (210 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); the cache-policy inventory now covers 37 GET handlers, while mutation coverage remains 38 handlers across 30 route files. Pure coverage verifies canonical deduplicated raw/CSV user-ID extraction, selected-field CSV generation, role labels, and spreadsheet-formula neutralization. MongoDB integration verifies migration 33, unique/query indexes, complete/empty snapshots, missing-snapshot truthfulness, ban upsert/removal, foreign-group rejection, and owner isolation. Registered populated list, export, and import states passed 360- and 1280-pixel captures without page-level horizontal overflow; the six screenshots were manually inspected, and Playwright exercised Bans selection, nested-dialog focus trapping, Escape/trigger focus restoration, and import parsing. Authenticated live list/ban/unban/import, Invites and Logs tabs, and a matched running-VRCX comparison remain open.

The 2026-08-17 Group Moderation Invites increment passed `pnpm test` (34 files, 154 tests), `pnpm lint` (214 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); inventories now cover 38 GET handlers and 39 mutation handlers across 31 mutation route files. Boundary coverage verifies the five strict actions and exact canonical invite/request/member child endpoints. MongoDB integration verifies migration 34, indexes, complete three-list snapshots, projected deletion/block transitions, and owner isolation. The populated sent-invite state passed registered 360- and 1280-pixel captures without page-level horizontal overflow; both screenshots were manually inspected for the nested count tabs, dense table, paging, selected state, shared bulk area, narrow horizontal tab access, and desktop bounds. Authenticated live list/actions, join/blocked populated visual comparison, the Logs tab, and a matched running-VRCX comparison remain open.

The 2026-08-17 Group Moderation Logs increment passed `pnpm test` (35 files, 157 tests), `pnpm lint` (217 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); the cache-policy inventory now covers 39 GET handlers. Pure coverage verifies VRCX audit-type labels, selected-field CSV shape, JSON data escaping, and spreadsheet-formula neutralization. MongoDB integration verifies migration 35, filter-specific indexes, complete/empty snapshots, and owner isolation. Populated table and export states passed registered 360- and 1280-pixel captures without page-level horizontal overflow; the four screenshots were manually inspected, while Playwright verified the nested export dialog's Escape and trigger-focus restoration. Authenticated live type/log pagination, selected-type refresh, and a matched running-VRCX comparison remain open.

The 2026-08-17 Avatar Dialog moderation increment passed `pnpm test` (36 files, 159 tests), `pnpm lint` (218 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages). Schema coverage verifies both upstream timestamp shapes and rejects unsupported moderation types and non-avatar targets; MongoDB integration verifies migration 36, required indexes, active/inactive history, and owner isolation. The monitor now reconciles avatar moderations without a browser, while the existing strict action route performs only fixed block/unblock requests and preserves upstream-success semantics when local persistence needs repair. Unblocked/blocked menus and block/unblock confirmations passed registered 360- and 1280-pixel captures without page-level horizontal overflow; all eight moderation screenshots were manually inspected, and Playwright verified confirmation focus trapping, Escape, and trigger-focus restoration. Authenticated live block/unblock, scheduled-reconciliation recovery, and matched running-VRCX comparison remain open.

The 2026-08-17 Avatar Dialog gallery/listing increment passed `pnpm test` (37 files, 163 tests), `pnpm lint` (222 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages); inventories now cover 40 GET handlers and 40 mutation handlers across 32 mutation route files. Parser coverage verifies gallery author/tag binding, complete-latest-version rendering and listing fields. MongoDB integration verifies migration 37, complete/empty gallery snapshots, uploaded-file projection, indexes and owner isolation. The populated owner gallery/listing and fullscreen-preview states passed registered 360- and 1280-pixel captures without page-level horizontal overflow; all four screenshots were manually inspected, while Playwright verified preview focus trapping, Escape and trigger-focus restoration. Authenticated live gallery read/upload and matched running-VRCX comparison remain open.

The 2026-08-17 Avatar Dialog fallback/impostor increment passed `pnpm test` (38 files, 166 tests), `pnpm lint` (224 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages). Pure boundary coverage verifies the strict action union, rejects browser-supplied endpoint data, requires a Quest tag for fallback selection, requires authoritative authorship for all impostor mutations, and fixes the exact child-endpoint allowlist. Populated fallback, owner-with-impostor and owner-without-impostor menu/confirmation states passed registered 360- and 1280-pixel captures without page-level horizontal overflow; all eight screenshots were manually inspected, while Playwright reverified confirmation focus trapping, Escape and trigger-focus restoration. Authenticated live fallback/create/delete/regenerate behavior and matched running-VRCX comparison remain open.

The 2026-08-17 Avatar Dialog metadata increment passed `pnpm test` (39 files, 169 tests), `pnpm lint` (226 files), and `pnpm build` on Next.js 16.3.0 (30 generated pages). Pure policy coverage verifies the exact non-empty update field set, rejects extra browser fields and unsupported release states, and requires both authoritative avatar ID and singleton-owner authorship before update or deletion. Successful changes replace or remove the owner-scoped MongoDB avatar cache, while local persistence failure after upstream success requests reconciliation instead of inviting a duplicate mutation. The populated owner menu, Make Private confirmation, Rename prompt, Change Description prompt and destructive Delete confirmation passed registered 360- and 1280-pixel captures without page-level horizontal overflow; all ten screenshots were manually inspected. Playwright verified initial field focus, confirmation/editor focus trapping, Escape, and Manage-trigger focus restoration. Authenticated live update/delete behavior and matched running-VRCX comparison remain open.

The 2026-08-17 Avatar Dialog content/style-tag increment passed `pnpm test` (39 files, 172 tests), `pnpm lint` (228 files), and `pnpm build` on Next.js 16.3.0 (31 generated pages); the cache-policy inventory now covers 41 GET handlers. Pure coverage verifies namespace-preserving content/author tag replacement, duplicate removal, fixed style-name-to-`avst_` mapping, unknown-style rejection, strict browser fields and the exact `avatarStyles` allowlist. MongoDB integration verifies migration 38, style-snapshot indexes, authoritative empty snapshots and owner isolation. The expanded owner menu plus populated Set Avatar Tags and Set Avatar Styles states passed registered 360- and 1280-pixel captures without page-level horizontal overflow; all six screenshots were manually inspected. Playwright verified first-control focus, focus trapping, Escape and Manage-trigger focus restoration. Authenticated live batch tag/style mutation and matched running-VRCX comparison remain open.

The 2026-08-17 My Avatars tag-editor routing increment passed `pnpm test` (39 files, 172 tests), `pnpm lint` (228 files), and `pnpm build` on Next.js 16.3.0 (31 generated pages). Card and table commands now open Set Avatar Tags or Set Avatar Styles directly through the shared Avatar Dialog instead of stopping at its Info view. Registered 360- and 1280-pixel captures cover both direct commands with authoritative-owner loading, initial-control focus, focus trapping, Escape restoration to the parent Manage control, and no page-level horizontal overflow; all four screenshots were manually inspected. The deterministic visual fixture now supplies owned-avatar authorship, content/author tags, styles, cached gallery emptiness and favorite-list responses so the workflow never depends on a live VRChat session during parity checks.

The 2026-08-20 Avatar Dialog image-editing increment passed `pnpm test` (40 files, 174 tests), `pnpm lint` (232 files), and `pnpm build` on Next.js 16.3.0; the same-origin inventory now covers 41 mutation handlers across 33 route files, and the generated route manifest contains the dedicated avatar-image endpoint. Pure coverage rejects another owner, another file tag and an incomplete latest upload version. The populated Change Avatar Image state passed registered 360- and 1280-pixel captures without page-level horizontal overflow; both screenshots were manually inspected, while Playwright verified file selection through the owner-only menu, first-control focus, focus trapping, Escape and Manage-trigger focus restoration. Authenticated live `avatarimage` upload plus avatar `imageUrl` mutation and a matched running-VRCX comparison remain open.

The 2026-08-20 owned World Dialog metadata increment passed `pnpm test` (41 files, 178 tests), `pnpm lint` (234 files), and `pnpm build` on Next.js 16.3.0; the same-origin inventory now covers 42 mutation handlers across 34 route files, and the generated route manifest contains the maintained world endpoint. Pure coverage verifies the strict single-field policy, hard/recommended capacity invariant, VRCX-compatible direct-ID and URL YouTube parsing, and authoritative author ownership. The owner menu and Rename, Change Description, Change Capacity, Change Recommended Capacity, and Change YouTube Preview dialogs passed registered 360- and 1280-pixel captures; all twelve screenshots were inspected, while Playwright verified initial input focus, focus trapping, Escape, and Manage-trigger focus restoration. Authenticated live world updates, the remaining eligible owner actions, and a matched running-VRCX comparison remain open.

The 2026-08-20 owned World Dialog tag/domain increment passed `pnpm test` (41 files, 180 tests), `pnpm lint` (234 files), and `pnpm build` on Next.js 16.3.0; same-origin coverage remains at 42 mutation handlers across 34 route files because both operations extend the maintained fixed world endpoint. Pure coverage verifies VRCX control-state translation, custom content-tag retention, protected-tag fallback retention, unknown disabled-ability retention, bounded unique domains, and rejection of mixed updates. Populated Set World Tags and Allowed Video Player Domains states passed registered 360- and 1280-pixel captures; all four screenshots were inspected, while Playwright verified initial-control focus, focus trapping, Escape, and Manage-trigger focus restoration. Authenticated live tag/domain updates and a matched running-VRCX comparison remain open.

The 2026-08-20 owned World Dialog image-editing increment passed `pnpm test` (41 files, 181 tests), `pnpm lint` (235 files), and `pnpm build` on Next.js 16.3.0; the same-origin inventory now covers 43 mutation handlers across 35 route files, and the generated route manifest contains the dedicated world-image endpoint. Pure coverage verifies that only the active owner's complete `worldimage` upload is accepted. The populated Change World Image state passed registered 360- and 1280-pixel captures without page-level horizontal overflow; both screenshots were manually inspected, while Playwright verified file selection through the owner-only menu, first-control focus, focus trapping, Escape, and Manage-trigger focus restoration. Authenticated live `worldimage` upload plus world `imageUrl` mutation and a matched running-VRCX comparison remain open.

The 2026-08-23 owned World Dialog publication/delete increment passed `pnpm test` (42 files, 186 tests), `pnpm lint` (238 files), and `pnpm build` on Next.js 16.3.0; the same-origin inventory now covers 44 mutation handlers across 36 route files, and the generated route manifest contains the dedicated world-actions endpoint. Pure coverage verifies the strict action union, authoritative ownership, publication fallback, and exact `/publish` allowlist child; MongoDB integration verifies owner-isolated world deletion. The expanded owner menu and Publish, Unpublish, and destructive Delete confirmations passed registered 360- and 1280-pixel captures; all eight screenshots were manually inspected, while Playwright verified Cancel initial focus, focus trapping, Escape, and Manage-trigger focus restoration. Authenticated live publication/deletion and a matched running-VRCX comparison remain open.
