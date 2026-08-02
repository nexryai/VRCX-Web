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

### Observation Model

- Use the VRChat Pipeline WebSocket for prompt friend presence, relationship, notification, and other supported events.
- Use paginated HTTP snapshots at startup and on a schedule to establish baselines and repair gaps because the Pipeline is not a durable event queue.
- After disconnect or process restart, validate the session, reconcile current remote state, derive any safely inferable changes, and reconnect.
- Persist both upstream occurrence time, when available, and ingestion time. Mark events derived from snapshot differences so the UI does not imply unavailable precision.
- Deduplicate with upstream IDs or deterministic keys. Event handling and reconciliation must be safe to retry.
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
| `game_sessions` | API-observed location sessions for the active account, including bounded/current state and observation provenance | Unique deterministic session key; start/end, location, and current-session indexes; at most one open session |
| `activity_events` | Feed, Friend Log, presence, status, location, avatar, bio, and relationship history | Unique idempotency key; subject/time and type/time indexes |
| `notifications` | Legacy and V2 notification state and history | Unique upstream notification ID; created/seen indexes |
| `favorites` | VRChat and VRCX-local favorite group membership | Unique owner/type/group/object tuple |
| `memos`, `avatar_tags` | User/world/avatar memos and avatar tagging | Unique target or target/tag keys |
| `moderations` | Remotely visible moderation snapshots/history | Unique subject/type key; updated index |
| `mutual_graph` | Mutual-friend nodes, edges, opt-outs, and fetch metadata | Unique edge and friend metadata keys |
| `jobs` | Restart-safe backfills, migrations, imports, and long-running fetch state | Unique job key; status/updated index |

Detailed schemas, retention, and VRCX SQLite/JSON mappings must be added before implementing each repository. MongoDB migrations must be versioned, idempotent, and restart-safe.

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
| Feed and Friend Log | Server-derived | Persist remote relationship, presence, location, status, display name, bio, avatar, and notification changes observed continuously by the server |
| Friend List and user details | Remote-compatible | Port complete remote-backed tables, filters, tabs, dialogs, and actions |
| Search for users, worlds, groups, avatars | Remote-compatible | Port approved provider/API searches through allowlisted server boundaries |
| Favorite friends, worlds, avatars and local groups | Remote-compatible | Persist remote favorite state and VRCX-local organization in MongoDB |
| Notifications and invite responses | Remote-compatible | Ingest Pipeline plus HTTP reconciliation; port remote actions; exclude join actions requiring the running game |
| Moderation | Remote-compatible | Port remotely supported player/avatar moderation display and actions |
| My Avatars | Browser-adaptable | Port remote management and browser upload/crop workflows; persist tags/memos/cache metadata in MongoDB |
| Dashboard | Product-excluded | Do not port it; remove the existing prototype route and navigation entry rather than rebuilding VRCX dashboard widgets |
| Mutual Friends chart | Server-derived | Store graph, opt-outs, cursors, and rate-limited fetch jobs in MongoDB |
| Instance Activity and Hot Worlds charts | Server-derived, fidelity investigation required | Determine whether continuously observed remote friend locations can truthfully reproduce each metric; label or omit fields needing local instance occupancy |
| Previous instances for users/worlds/groups | Server-derived | Build from remotely observed locations with explicit observation-source semantics |
| Game Log — sessions view only | Server-derived | Port the VRCX session list from remote observations of the active account's location, including world/group metadata, observed start/end and duration, current state, search, date filtering, collapse, and incremental loading; omit table mode and unavailable local-log event controls |
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

The server records only facts available through Pipeline events or HTTP reconciliation. Feed includes GPS, Online, Offline, Status, Avatar, and Bio changes. Friend Log includes Friend, Unfriend, FriendRequest, DisplayName, and TrustLevel changes. VRCX's `CancelFriendRequest` filter is intentionally omitted because the remote notification projection cannot distinguish cancellation from expiration or dismissal reliably. Avatar detail shows remotely observed image URLs but cannot reproduce historical avatar names or owners that were never supplied by the API. Online/offline duration is not shown unless both boundaries were actually observed. No value is fabricated to fill these gaps.

VRCX-persisted type filters, favorite-only state, and page size are stored in the singleton MongoDB settings document. Search and the active date range remain transient view state. Feed keeps expandable rows and never exposes destructive history controls; Friend Log keeps row-level deletion with confirmation and Shift-click bypass. On narrow screens the dense source table remains horizontally scrollable inside its content pane so columns are retained rather than silently dropped.

## Friend List Scope

`VRCX/src/views/FriendList/FriendList.vue` and `VRCX/src/views/FriendList/columns.jsx` are the authoritative sources for the toolbar, dense sortable table, favorite-only mode, selectable search fields, profile loading, mutual-friend loading, bulk unfriend mode, individual unfriend action, and pagination. The web port retains every remote-backed column: avatar, display name, trust rank, status, languages, bio links, mutual count/opt-out, remotely observed last seen, last activity, last login, and date joined. Full-profile loading enriches the MongoDB user cache and is merged with the fresher presence snapshot on subsequent reads. Mutual graph fetching is shared with the chart and persists its completed snapshot in MongoDB.

Join Count and Time Together remain omitted because VRCX derives them from local game logs. Note and Memo search are deferred until their MongoDB repositories and edit surfaces are ported, so they are not shown as nonfunctional filter choices. VRCX's historical friend number cannot be reconstructed exactly for identities first seen after this server port starts; the `No` column uses a stable current-projection fallback until prospectively observed relationship ordering exists. This difference must not be presented as an exact friendship-age claim. The wide source table scrolls within its content pane at narrow widths rather than dropping columns.

## Delivery Plan

### Milestone 0 — Rebaseline and Reference Capture

Status: In progress

- [x] Record the single-user, always-on, MongoDB, VRCX-parity direction in `AGENTS.md`, `PLANS.md`, and `README.md`.
- [ ] Inventory every VRCX route, navigation item, dialog, store, realtime event, API path, setting, and database method.
- [ ] Capture the running VRCX shell and key states at fixed desktop content viewport sizes.
- [ ] Create a difference register mapping every current root route to its VRCX source and visible deviations.
- [ ] Confirm remote observation feasibility for all formerly local-derived charts and histories.
- [ ] Capture populated, current, historical, filtered, loading, and empty Game Log session reference states.
- [ ] Record exact exclusions without removing remotely derivable behavior.

Exit criteria: the scope inventory, visual fixtures, persistence map, and remote-source map are sufficient to prevent guesswork.

### Milestone 1 — MongoDB Foundation and Single-User State

Status: In progress

- [x] Add the MongoDB driver, validated environment configuration, connection lifecycle, health check, and test database strategy.
- [ ] Define versioned migrations, indexes, repository boundaries, retention, backup, and restore behavior.
- [x] Implement singleton settings and active-identity records.
- [ ] Move current durable browser state into MongoDB with an explicit one-time migration/import path.
- [x] Implement encrypted server-side VRChat session persistence with the key supplied outside MongoDB.
- [x] Add safe active-identity replacement that prevents cross-account data mixing.

Exit criteria: the server restarts without losing authoritative application state, and no new durable product data is browser-owned.

### Milestone 2 — Always-On VRChat Monitor

Status: In progress

- [x] Port the currently eligible VRCX Pipeline event parsing for own location, notifications, and friend invalidation into typed server modules.
- [x] Implement startup baseline synchronization and paginated HTTP reconciliation for current user, friends, and notifications.
- [x] Add reconnect backoff, post-gap reconciliation, session-expiry recovery, and coordinated in-process rate limiting.
- [x] Add MongoDB-backed singleton leader leasing for multi-process safety.
- [ ] Implement idempotent event writes, current-state projections, cursors, and derived-event provenance.
- [x] Implement active-account location session opening, transition, bounded closing, and restart/gap reconciliation in `game_sessions`.
- [x] Expose monitor health and stream/reconciliation timestamps to the UI.
- [x] Cover browser-independent lease loss, disconnect, reacquisition, baseline reconciliation, and Pipeline reconnection with a deterministic monitor lifecycle test.
- [ ] Prove monitoring and restart recovery with no browser connected.

Exit criteria: one server monitor maintains recoverable remote state continuously and safely across disconnects and restarts.

### Milestone 3 — Exact VRCX Shell and Shared UI

Status: In progress

- [ ] Port VRCX theme variables, typography, icons, spacing, density, scrollbars, motion, and component-state styles.
- [ ] Recreate the VRCX layout, navigation, status bar, friend sidebar, menus, popovers, dialogs, and settings structure.
- [ ] Build shared React primitives only from observed VRCX patterns.
- [x] Remove navigation and settings entries for confirmed Local-VRChat-only and Dashboard features from the current shell.
- [ ] Add matched-viewport screenshot tests for the shell's significant states.
- [x] Add a deterministic MongoDB-backed capture harness for current-port Friends Locations, Feed, Friend Log, Friend List, and Game Log states at 360, 768, 1280, and 1920 pixels.
- [ ] Verify narrow layouts without introducing a separate visual design.

Exit criteria: the root shell is visually indistinguishable from VRCX within documented browser rendering tolerances.

### Milestone 4 — Remote Workflows and History

Status: Planned

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
- [ ] Test prolonged operation, rate limits, upstream outages, malformed events, session expiry, MongoDB interruption, process restart, and lease failover.
- [ ] Audit route allowlists, XSS, CSRF, request forgery, cache behavior, secrets, encryption, logging, and accidental public exposure.
- [ ] Verify MongoDB backup/restore and retention/cleanup workflows.
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

### 2026-08-02 — Keep the Deployment Private Without Custom Application Auth

Decision: Do not add application accounts or authorization. Protect the deployment through trusted-network operations while keeping VRChat authentication and secrets server-side.

Rationale: Only one operator uses the server.

Consequence: Private HTTPS deployment remains mandatory guidance, and normal XSS, CSRF, credential, proxy, and accidental-exposure protections still apply.

## Historical Verification

Before this rebaseline, the browser-session prototype passed its existing unit tests, Biome check, Next.js production build, anonymous redirect smoke test, security-header check, and cross-site mutation rejection. That evidence remains useful for unchanged low-level code but does not establish MongoDB, always-on monitoring, or VRCX visual parity.

The 2026-08-02 documentation rebaseline passed `pnpm test` (5 files, 13 tests), `pnpm lint` (74 files), and `pnpm build` (28 generated routes).

Authenticated VRChat behavior, long-running monitoring, restart recovery, MongoDB migrations, and matched-state VRCX screenshots remain required operator checks as those systems are implemented.

The 2026-08-02 MongoDB visual-fixture increment passed `pnpm test` (7 files, 23 tests), `pnpm lint` (108 files), and `pnpm build` (21 generated pages). Friends Locations and Game Log were rendered from synthetic MongoDB projections at 360, 768, 1280, and 1920 pixels with no page-level horizontal overflow. This found and fixed a status-clock hydration mismatch and narrow-layout clipping. The later Feed, Friend Log, and Friend List ports extended the same fixture to those screens and again passed all four overflow checks. Running-VRCX reference comparisons and authenticated operator smoke tests remain outstanding.

The 2026-08-02 monitor-failover increment passed `pnpm test` (8 files, 26 tests), `pnpm lint` (109 files), and `pnpm build` (21 generated pages). Automated coverage now proves that a monitor with no browser connected closes its Pipeline socket when it loses the MongoDB lease, then performs a new HTTP baseline before reconnecting after lease reacquisition. A live authenticated process-restart soak remains an operator acceptance item.
