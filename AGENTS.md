# AGENTS.md

## Project Mission

Build a local-first, single-user Next.js port of VRCX. The original VRCX source in `./VRCX/` is the authoritative product, behavior, interaction, and visual reference. The destination application lives at the repository root and uses Next.js, React, TypeScript, Tailwind CSS, Biome, and MongoDB.

The application server is expected to run continuously on infrastructure controlled by one operator. It must monitor the signed-in VRChat account through remote VRChat HTTP and realtime APIs even when no browser tab is open, persist the resulting VRCX-compatible history and application state in MongoDB, and present that state through a UI that reproduces VRCX as exactly as the browser platform permits.

This file applies to the entire repository except the nested `./VRCX/` reference checkout. Treat that checkout as read-only input unless a task explicitly requests a reference update. The root application must not import runtime modules from, or require, `./VRCX/` at build time or runtime.

## Non-Negotiable Product Rules

1. Reproduce VRCX instead of redesigning it.
   - Match VRCX's information architecture, navigation, terminology, localization, colors, typography, icons, spacing, sizing, borders, shadows, density, component states, dialogs, tables, and interaction patterns.
   - Port from the corresponding VRCX implementation. Directly reuse or closely translate suitable MIT-licensed VRCX component logic, styles, localization, and assets whenever that improves fidelity, with required notices and provenance.
   - Existing root UI is provisional wherever it differs from VRCX. Do not preserve a root-web convention merely because it already exists.
   - Browser-required differences must be as small as possible and recorded in `PLANS.md`. Convenience, framework defaults, and conventional website styling are not valid reasons for divergence.
2. Use a continuously running server-side VRChat monitor.
   - Recreate remote-observable VRCX behavior with the VRChat Pipeline/realtime API as the primary event source and scheduled HTTP API reconciliation for startup, reconnects, missed events, and data not provided by the realtime stream.
   - Monitoring must continue without an open browser page. Do not make React components, browser timers, or page refreshes responsible for durable observation.
   - Persist normalized events, snapshots, synchronization cursors, and monitor health so restarts are recoverable and duplicate events can be handled idempotently.
3. Store durable VRCX application data in MongoDB.
   - MongoDB is the source of truth for settings, preferences, remote snapshots, feed and friend history, notifications, favorites, tags, memos, caches, graph snapshots, synchronization state, and other data VRCX would persist.
   - Do not introduce new durable product state in `localStorage`, `sessionStorage`, process memory, JSON files, or SQLite. Browser storage may be used only for disposable, non-authoritative UI state when there is a concrete reason.
   - Store large binary data in GridFS or an explicitly documented MongoDB-backed representation when such data is in scope.
   - Keep credentials and VRChat session material server-side. If session material must survive a restart, encrypt it before MongoDB persistence and keep the encryption key outside the database and repository.
4. Design for exactly one operator and one active VRChat identity.
   - Do not build application accounts, registration, roles, organizations, invitations, tenant routing, or per-user authorization.
   - Use singleton application settings and monitor ownership. Domain records may still contain VRChat user IDs because those IDs describe friends, groups, authors, or event subjects, not application tenants.
   - Logging in as a different VRChat account deliberately replaces the active monitored identity through an explicit, safe reset or migration flow; the server must not silently mix two identities' data.
5. Exclude functionality that requires a local VRChat installation or local desktop integration.
   - Do not port features whose useful operation requires the VRChat process, local VRChat files or logs, Steam, OpenVR, OSC tied to the local client, Windows APIs, registry access, named pipes, Electron window/tray behavior, or arbitrary local filesystem access.
   - Omit excluded features and controls rather than displaying permanent placeholders.
   - A feature is eligible when its behavior can be derived from remote APIs, server-side history, MongoDB data, or ordinary browser capabilities without a local VRChat client.
   - Game Log is a required exception at the feature level: port its VRCX session presentation for every session fact that can be observed through remote VRChat APIs. Exclude only the individual event types and table mode that require local game logs.
   - Dashboard is excluded by product decision even where individual widgets could be remotely derived. Do not port it, list it in production navigation, or preserve the existing prototype route as a shipped feature.
6. Target VRCX visual parity at desktop sizes.
   - The reference desktop layout is the primary acceptance target. Match VRCX at equivalent content viewport sizes before adding narrow-screen adaptations.
   - Responsive changes must preserve VRCX's hierarchy and styling. They must not turn the product into a visually different mobile website.
   - Never rely on hover alone; equivalent touch and keyboard access must remain available.

## Sources of Truth

Use this priority when requirements appear ambiguous:

1. The user's current request.
2. This `AGENTS.md` and accepted decisions in `PLANS.md`.
3. Original VRCX behavior and source under `VRCX/`.
4. Existing root application behavior.

Before porting a feature, inspect its complete VRCX path through views, components, styles, stores, coordinators, queries, API modules, services, types, localization, and database methods. Existing root code is not proof of parity.

## Reference-to-Next.js Porting Workflow

For each feature:

1. Identify the exact VRCX views, components, styles, stores, coordinators, API calls, realtime events, persisted tables or settings, assets, and localization strings involved.
2. Classify each behavior as `Remote-compatible`, `Server-derived`, `Browser-adaptable`, `Local-VRChat-only`, `Product-excluded`, or `Unclear` using the eligibility gate below.
3. Define the MongoDB collections, indexes, retention behavior, and idempotency keys needed to replace the relevant VRCX SQLite, JSON, or browser-persisted data.
4. Define how the always-on monitor obtains and reconciles the data. Prefer realtime events for prompt changes and scheduled HTTP snapshots for correctness.
5. Port the eligible behavior into maintained root source paths. Translate Vue/Pinia components and state into faithful React/TypeScript equivalents; reuse styles, constants, strings, pure utilities, icons, and assets where practical.
6. Compare the result against the running VRCX screen and source at matched viewport dimensions. Cover loading, empty, populated, selected, disabled, error, dialog, and menu states.
7. Add only the narrow-screen adaptation necessary to keep the same workflow usable.
8. Record reference paths, persistence mappings, monitoring behavior, excluded local-only behavior, and every intentional UI difference in `PLANS.md` or a linked feature specification.

Do not import production modules directly from `./VRCX/`. The root application must remain independently buildable and deployable.

## Eligibility Gate

| Classification | Criteria | Action |
| --- | --- | --- |
| Remote-compatible | VRCX obtains the behavior from a remote VRChat or other approved HTTP/realtime service | Port it through typed server boundaries |
| Server-derived | VRCX derives the behavior from observations that the always-on server can reproduce from remote events, periodic snapshots, and MongoDB history | Port the derived behavior and document its observation limits |
| Browser-adaptable | The workflow can use standard browser capabilities without requiring the local VRChat client | Port it with the smallest necessary browser adaptation |
| Local-VRChat-only | It requires a locally installed/running VRChat client, local game logs/files, or native desktop/VR integration and has no useful remote equivalent | Exclude it from production navigation and settings |
| Product-excluded | The user has explicitly removed the feature from product scope even if it is technically feasible | Do not port it; remove existing prototype routes and controls |
| Unclear | The remote source or parity path is not verified | Investigate VRCX and the upstream interface before coding |

A local dependency in VRCX does not by itself exclude a feature if the same user-visible result can be derived remotely. Conversely, do not fabricate precision that the remote APIs cannot provide; document the difference and omit controls that cannot work truthfully.

## Always-On Monitor Rules

- Run monitoring in a long-lived Node.js deployment, not a serverless or request-only runtime.
- Maintain one active VRChat session and one realtime connection for the configured operator.
- On startup, load encrypted session state, validate the session, establish baseline snapshots, then connect the realtime stream.
- Reconnect with bounded exponential backoff and jitter. After a disconnect, reconcile authoritative HTTP snapshots before declaring the monitor healthy.
- Use scheduled HTTP reconciliation even while realtime is healthy because realtime delivery is not a durable queue.
- Make ingestion idempotent with upstream IDs where available and deterministic event keys otherwise.
- Write raw upstream payloads only when a documented diagnostic or replay need exists; minimize sensitive data and apply retention limits.
- Expose monitor health, last successful realtime event, last reconciliation, rate-limit state, and authentication-required state to the VRCX-equivalent status UI.
- Coordinate the monitor as a singleton. Multiple Next.js workers must not create competing streams or duplicate scheduled jobs; use a MongoDB lease or an equivalent documented mechanism.
- Keep rate-limit handling centralized and ensure background reconciliation cannot starve interactive requests.
- Track the active account's remotely visible location as a sequence of observed game sessions. Open, transition, and close MongoDB session records idempotently as API state changes, retaining observation timestamps and provenance instead of claiming unavailable local-client precision.

## Game Log Session Rules

- Implement Game Log as a first-class navigation destination, but implement only VRCX's session view. Do not implement or expose the flat table view or the sessions/table view-mode toggle.
- Use `VRCX/src/views/GameLog/components/GameLogSessions.vue`, `GameLogSessionsSegment.vue`, `GameLogSessionsEvent.vue`, `VRCX/src/views/GameLog/sessions/buildGameLogSessions.js`, and their shared components/styles as the primary UI and behavior sources. Reuse or closely translate that code where practical.
- Represent every session field available from remote APIs: observed location/instance, world and group metadata, observed start and end, duration when bounded, current-session state, and source/freshness metadata needed for truthful recovery.
- Preserve the VRCX session list structure, sticky collapsible headers, location rendering, badges, search, date-range filtering, incremental loading, loading skeleton, empty state, and other controls that have real remote-backed behavior.
- Do not render controls or counters backed only by unavailable local-log events. In particular, do not fabricate player join/leave, portal spawn, video play, resource load, arbitrary local event, or external-log entries.
- Treat session boundaries as observations. Reconcile them after monitor restart or Pipeline gaps, distinguish exact upstream timestamps from poll-derived bounds, and never present an inferred time as exact.
- Persist sessions and their synchronization metadata in MongoDB. Session construction, reconciliation, querying, filtering, pagination, and retention must work without a connected browser.
- Compare the finished page directly with VRCX in session mode at matched viewport sizes. Apart from removing the table switch and unavailable local-event controls, styling and interaction differences require documentation and correction.

## MongoDB Rules

- Access MongoDB only from server-side modules. UI components and client bundles must never receive the connection string.
- Validate every document at repository/service boundaries and use precise TypeScript domain types; avoid `any`.
- Define indexes alongside each collection design, including unique idempotency indexes and time-based query indexes.
- Use UTC timestamps and retain the upstream timestamp separately when it differs from ingestion time.
- Prefer atomic updates, upserts, and MongoDB transactions where a user-visible invariant spans documents.
- Treat schema changes as versioned migrations. Migrations must be restart-safe and tested against representative existing data.
- Provide an explicit migration path for data already created by the root prototype and, when implemented, for supported VRCX SQLite/JSON exports. Do not silently discard existing history.
- Backup, restore, retention, and destructive cleanup behavior are operator-visible requirements, not deployment afterthoughts.

## UI Parity Rules

- Treat the running VRCX application and captured reference states as visual acceptance fixtures; use source code to resolve behavior and exact values.
- Establish VRCX-derived shared tokens and primitives before styling individual screens. Do not substitute generic Tailwind or browser defaults when VRCX provides a value.
- Use the same labels, grouping, ordering, iconography, row density, and dialog structure as VRCX for every eligible feature.
- Preserve all meaningful states: loading, empty, error, selected, disabled, hover, focus, pressed, active, unread, offline, and rate-limited.
- Keep browser chrome and deployment controls outside the replicated application surface.
- Prefer screenshot comparison at identical content viewport sizes. Material pixel differences require correction or a documented browser constraint.
- Maintain semantic HTML, accessible names, visible focus, keyboard order, adequate contrast, and reduced-motion support while keeping visual changes minimal.
- Preserve applicable VRCX copyright and MIT license notices for copied or substantial portions and record provenance where it would otherwise be unclear.

## Responsive Acceptance Baseline

Visual parity is evaluated first at the desktop content viewport sizes used for VRCX reference captures, including approximately 1280 and 1920 pixels wide. Also verify usability at approximately 360 and 768 pixels, but narrow layouts must remain recognizable as the same VRCX screen. Intentional local horizontal scrolling is acceptable for dense tables; accidental page overflow is not.

At every checked width, verify navigation access, overflow, dialogs, tables/lists, touch targets, text wrapping, fixed/sticky elements, and keyboard operation.

## Architecture and Security Boundaries

- Keep secrets, VRChat session material, MongoDB access, monitor code, and privileged upstream calls in server-only modules.
- Put external-service access behind typed, allowlisted service boundaries. Do not build an unrestricted proxy.
- Centralize upstream errors, session expiry, rate-limit handling, retries, and payload validation.
- Never log credentials, cookies, tokens, MongoDB connection strings, encryption keys, or sensitive upstream payloads.
- Never persist secrets in `localStorage`, source files, committed environment files, or client bundles.
- The trusted single-user deployment removes the need for application login and authorization, but not protections against XSS, CSRF, credential leakage, unsafe proxying, request forgery, or accidental public exposure.
- Validate untrusted upstream and browser input. Never render upstream HTML without explicit sanitization.
- Keep dependencies minimal and prefer the current stack and existing utilities.

## Code Quality and Comments

- Use TypeScript with precise domain types. Validate data crossing network, database, worker, and browser boundaries.
- Keep presentation, domain state, MongoDB repositories, upstream clients, and monitor orchestration separated.
- Comment non-obvious browser adaptations, parity decisions, monitor state transitions, idempotency logic, security constraints, upstream quirks, and copied-code provenance.
- Write comments, user-facing documentation, and Git history in English unless localization work explicitly requires another language.
- Do not add comments that merely restate straightforward code. Update or remove stale comments.
- Follow-up markers must state a concrete reason and point to a plan entry or issue when available.

## Testing and Verification

For every change, run the smallest relevant checks during development and the full applicable checks before handoff:

```bash
pnpm test
pnpm lint
pnpm build
```

Prioritize automated tests for:

- upstream parsing, rate limits, retry behavior, and error mapping;
- realtime event ingestion, reconnect reconciliation, deduplication, and monitor lease ownership;
- MongoDB repositories, indexes, migrations, retention, and state transitions;
- server restart recovery and operation with no browser connected;
- remote Game Log session boundary derivation, gap reconciliation, current-session recovery, filtering, and pagination;
- high-value VRCX workflows and visual regression states;
- responsive navigation and keyboard/touch interactions;
- security-sensitive routes and secret handling.

Manually compare every ported screen with VRCX at matched desktop dimensions, then verify the narrow-screen baseline. A passing build or a single screenshot is not parity evidence.

## Git Workflow

- Commit a small, focused change after each coherent, verified increment.
- Write commit subjects and bodies in English, using an imperative subject.
- Keep formatting, refactors, infrastructure, persistence, monitoring, and feature behavior separate when practical.
- Inspect the diff and run the relevant checks before committing.
- Do not commit secrets, local environment files, database dumps, build output, dependency caches, or unrelated worktree changes.
- Do not rewrite, squash, amend, discard, or combine another contributor's work unless explicitly requested.

## Planning and Handoff

- Use `PLANS.md` as the living roadmap and decision log.
- Update it whenever feature eligibility, monitoring semantics, MongoDB mappings, UI parity evidence, scope, or acceptance criteria change.
- Mark work complete only after implementation, data persistence, recovery behavior, tests, and visual comparison are verified.
- In handoffs, state what changed, what was verified, source paths used, MongoDB/monitor implications, deliberate differences from VRCX, and the next unresolved risk.
