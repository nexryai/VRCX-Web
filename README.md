# VRCX Next.js Port

This repository is a local-first, single-user Next.js port of [VRCX](https://github.com/vrcx-team/VRCX). The goal is to reproduce VRCX's eligible behavior and UI as exactly as the browser platform permits while running continuous VRChat API monitoring on the server and storing durable application data in MongoDB.

The original source in `./VRCX/` is the behavior, implementation, and visual reference. The root application is the maintained port and must build and run without the reference checkout.

## Current Status

The MongoDB foundation, encrypted server-owned VRChat session, monitor leadership, Pipeline connection, scheduled friend/notification reconciliation, activity projections, remote-derived Game Log session storage, and server-owned Mutual Friends fetch jobs are implemented. Durable settings and completed graph snapshots no longer use browser storage. The explicitly excluded Dashboard route and navigation entry have been removed.

This remains an in-progress port: several remote workflows still call VRChat interactively instead of reading complete MongoDB projections, and screen-by-screen visual parity work is not finished. See [PLANS.md](./PLANS.md) for the remaining acceptance work.

## Target Product

- One trusted operator and one active VRChat identity; no application accounts, roles, or multi-tenant behavior.
- A long-running Next.js/Node.js server that maintains the VRChat Pipeline connection and performs scheduled HTTP API reconciliation even when no browser is open.
- MongoDB as the source of truth for settings, synchronization state, snapshots, feed and friend history, notifications, favorites, tags, memos, caches, graph data, and other durable VRCX state.
- A React UI ported from VRCX's views, components, styles, assets, strings, and interactions, with matched-viewport visual comparison as the acceptance standard.
- A VRCX-faithful Game Log session view populated from continuously observed remote location state, the active identity's remote-observable activity, and MongoDB history.
- Browser adaptations only where required, with each material difference documented.

## Scope Boundary

Features available from remote VRChat APIs, continuously observed remote state, MongoDB history, or standard browser capabilities are generally eligible. This includes server-derived Feed, Friend Log, previous-location history, Game Log sessions, and charts when the remote observations can support them truthfully. Dashboard is an explicit product-scope exception and will not be ported.

Game Log implements only VRCX's session presentation. The server derives sessions from API-observed changes to the active account's location and stores observed boundaries, duration, world/group metadata, current state, and provenance in MongoDB. Remotely observed GPS, presence, status, avatar, and bio changes made by the active identity are recorded in Feed and nested into the applicable session; the first observation is only a baseline. The flat table and local-log player join/leave, portal, video, resource, external, and arbitrary event rows are intentionally absent. Their filters and the sessions/table switch are not shown.

Other features that require a locally installed or running VRChat client remain excluded: Photon Player List, screenshot Gallery, OpenVR/overlay support, Steam/registry/process control, local OSC, launch/attach, IPC, Electron window/tray behavior, and the desktop updater. Excluded controls must not appear as broken placeholders.

## Target Runtime

The final deployment requires:

- a persistent Node.js process rather than a request-only or scale-to-zero serverless host;
- MongoDB reachable only from the application server;
- outbound access to the approved VRChat API and realtime endpoints;
- a trusted private network, preferably behind HTTPS.

One monitor leader owns the active VRChat session, realtime connection, background reconciliation, and retention jobs. MongoDB-backed leadership prevents duplicate monitoring if more than one application process exists. Pipeline events and scheduled reconciliation are serialized through the leader, normalized history is written before current-state projections advance, and a MongoDB commit sequence records only successfully processed events. Because VRChat Pipeline has no replayable durable cursor, startup and reconnect recovery always reconcile authoritative HTTP snapshots before resuming realtime monitoring.

## Security Boundary

- The deployment intentionally has no separate application authentication or authorization layer, so it must not be exposed directly to the public internet.
- VRChat credentials, cookies, tokens, MongoDB connection strings, and encryption keys remain server-side and must never enter browser storage or logs.
- Restart-persistent VRChat session material is encrypted with AES-256-GCM before storage in MongoDB; its encryption key is configured outside MongoDB and the repository.
- Upstream requests use typed, fixed-host, allowlisted service boundaries rather than a general-purpose proxy.
- VRChat user, world, avatar, and group IDs must use their expected prefix and canonical UUID separator positions at browser, route, stored-setting, location-parser, and upstream allowlist boundaries; a merely 36-character hex-and-hyphen suffix is rejected.
- Every authenticated or operator-state GET API response explicitly disables caching; a source-level regression test inventories all route handlers so a new GET cannot silently omit `no-store`.
- Every POST, PUT, PATCH, and DELETE API handler rejects cross-site browser requests through the shared Fetch Metadata/Origin check; an all-route inventory prevents new mutation handlers from omitting it.
- Every route receives a Content Security Policy based on [Next.js's documented static policy](https://nextjs.org/docs/app/guides/content-security-policy): scripts and browser API connections stay same-origin, frames and plug-in objects are disabled, and production omits development-only `unsafe-eval`. React's bootstrap and dynamic VRCX layout styles require the documented static-policy `unsafe-inline` exceptions until a verified nonce migration can dynamically render every page.
- Automatic remote media loads are limited to `api.vrchat.cloud`, `files.vrchat.cloud`, and `assets.vrchat.com`, matching the hosts preconnected by VRCX. Every HTML/SVG image passes through the same URL validator; other HTTP(S) notification URLs remain explicit click-through links instead of causing an unprompted browser request.
- Production application modules do not write raw diagnostics directly. Monitor failures are reduced to operator-safe durable health messages, while the backup and restart harnesses structurally redact MongoDB URI credentials, Authorization values, VRChat cookies, encryption-key assignments, and token-like query parameters before emitting captured child-process errors.
- The default production command binds only to `127.0.0.1`; exposing a different bind address is an explicit deployment decision that requires private ingress controls.
- Single-user operation does not remove normal XSS, CSRF, request-forgery, validation, cache, and secret-handling requirements.

## Development

The current prototype uses Node.js 22.13+ and pnpm 11.18+ (the runtime floor required by the pinned pnpm release):

Copy `.env.example` to an uncommitted environment file or configure the equivalent deployment secrets. Generate the session key with `openssl rand -base64 32`; keep the same key for the lifetime of the database because changing it invalidates the retained VRChat session.

```bash
pnpm install
pnpm dev
```

Run the verification suite with:

```bash
pnpm test
pnpm lint
pnpm build
```

Before a release or dependency update, reproduce the exact lockfile and audit both production and development dependencies. The license inventory is limited to shipped production packages:

```bash
pnpm install --frozen-lockfile
pnpm dependencies:audit
pnpm dependencies:licenses
```

The workspace permits an install script only for the test-only `mongodb-memory-server` package. Next.js image support resolves `sharp` without running its install script, and the `nanoid` override is the minimum patched release required by the current Next.js/PostCSS dependency chain.

For deterministic responsive screenshots, start the development-only MongoDB fixture in one terminal and capture the ported reference screens in another:

```bash
pnpm exec playwright install chromium
pnpm visual:fixture
pnpm visual:capture
```

The capture command writes ignored images under `.visual/` for Friends Locations, Feed, Friend Log, Friend List, User Dialog, World Dialog, Group Dialog, Avatar Dialog, their favorite-group choosers, Notifications, Game Log, Search, Favorite Friends and its transfer dialogs, Favorite Worlds, Favorite Avatars, Moderation, My Avatars, Mutual Friends, and Settings states at 360, 768, 1280, and 1920 pixels wide, and fails on page-level horizontal overflow. Set `VRCX_VISUAL_ONLY` to comma-separated capture names or `VRCX_VISUAL_WIDTHS` to comma-separated viewport widths when running a focused subset. The fixture uses only synthetic records and disables the always-on monitor in development; production startup cannot use this bypass. These images make the current port reproducible but do not replace matched screenshots from the running VRCX reference application.

MongoDB migrations are versioned in `schema_migrations` and run automatically and idempotently when the application first accesses the database. `GET /api/health` is the deployment health probe; it returns HTTP 503 without exposing driver details when MongoDB is unavailable.

Deployments upgraded from the former root browser-storage prototype have an explicit one-time importer under Settings → System → Application data. It reads only the same-origin `vrcx-theme`, `vrcx-nav-collapsed`, and `vrcx-my-avatars-view` keys that the old root code actually wrote, ignores malformed values, and shows the detected count before asking for confirmation. A successful import writes only those preferences to MongoDB, records a durable versioned completion marker so another tab cannot reapply them, and removes only the imported legacy keys. It never scans, uploads, or clears unrelated browser storage. The importer is a root-prototype compatibility path, not a VRCX desktop data importer.

The Favorites import dialogs accept VRCX's Friend, World, and Avatar Favorites CSV exports as well as its friend-list and owned-avatar CSV ID layouts. IDs must use the canonical VRChat UUID shape, files are limited to 1 MB, duplicates and wrong entity kinds are discarded, and every candidate is resolved through the fixed server route before it can be written to a MongoDB local group or a capacity-checked VRChat favorite group. VRCX's Windows registry backup is local-client-only and is intentionally unsupported; VRCX does not provide a general portable database export.

VRCX's Avatar Feed cleanup is available under Settings → System → Database cleanup. Automatic cleanup can be disabled or retain 30, 90, 180, or 365 days of avatar-change history; the monitor checks the per-identity schedule weekly without requiring a browser. Manual cleanup supports 180, 365, or 730 days and all avatar-change history. Both paths delete only owner-scoped Avatar Feed events—other Feed types, Friend Log, Game Log sessions, current projections, favorites, tags, and memos are retained. Because a self Avatar event is one shared record, deleting it also removes that nested activity row from its Game Log session without deleting the session. Back up MongoDB before manual purge because deletion cannot be undone.

Production must run as a persistent Node.js process:

```bash
pnpm build
pnpm start
```

`pnpm start` listens on `127.0.0.1:3000` so a normal host deployment can place a same-host HTTPS reverse proxy in front without accidentally publishing the unauthenticated application port. A container or isolated network namespace that genuinely requires a non-loopback listener must run `pnpm exec next start --hostname 0.0.0.0` deliberately and restrict that port to its trusted ingress; never publish it directly to the internet. Configure HSTS at the TLS terminator only after HTTPS is verified for the deployment, because the application also supports explicitly trusted private HTTP networks.

Do not deploy to a scale-to-zero or request-only runtime. Back up both MongoDB and `VRCHAT_SESSION_ENCRYPTION_KEY`; the database backup alone cannot decrypt the retained session.

### MongoDB backup and isolated restore proof

Install [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/installation/) 100.3 or newer, stop application writers, and run:

```bash
pnpm mongodb:backup-smoke
```

The command requires `MONGODB_URI`, `MONGODB_DATABASE` when the database is not named `vrcx`, and the matching `VRCHAT_SESSION_ENCRYPTION_KEY`. `MONGODUMP_BINARY` and `MONGORESTORE_BINARY` may point to non-default Database Tools binaries. The proof keeps the URI out of process arguments by writing a mode-0600 temporary `--config` file, creates a temporary compressed archive, restores it into a generated `vrcx_restore_smoke_*` database, and compares every document, collection option, and relevant index. When an encrypted VRChat session exists, it also proves that the configured key decrypts the restored representation. The generated database and archive are removed whether the proof passes or fails; the source database is never a restore target. The command rejects a dump if the source changes while it is being captured, so stopping writers remains required for useful evidence.

The smoke test proves recoverability but deliberately does not retain a backup. For an operator-owned archive, put the connection URI in a mode-0600 [Database Tools configuration file](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-examples/#hide-password-in-a-configuration-file) and use a separate restore namespace:

```bash
mongodump --config=/secure/path/mongodb-tools.yml --db="$MONGODB_DATABASE" --archive=vrcx.archive.gz --gzip
mongorestore --config=/secure/path/mongodb-tools.yml --archive=vrcx.archive.gz --gzip --nsFrom="${MONGODB_DATABASE}.*" --nsTo="vrcx_restore_YYYYMMDD.*"
```

Inspect and test the isolated restore before any deliberate recovery of the application namespace. Stop application writers or otherwise take a consistent database snapshot during backup and recovery. Never commit archives, environment files, Database Tools configuration files, or encryption keys. See the official [`mongodump`](https://www.mongodb.com/docs/database-tools/mongodump/) and [`mongorestore`](https://www.mongodb.com/docs/database-tools/mongorestore/) documentation for deployment-specific authentication, topology, and compatibility requirements.

### Authenticated monitor restart proof

An operator acceptance harness verifies the production startup path without opening or requesting a browser page. It starts the built Next.js server, waits for a completed HTTP baseline and healthy Pipeline connection in MongoDB, sends `SIGKILL`, immediately starts a fresh server process, and verifies a new leader completes another baseline while preserving the active identity and monotonic Pipeline commit sequence.

Run this only against an isolated authenticated test deployment. The command deliberately terminates both server processes that it owns, may wait for the 60-second leader lease to expire, and must not be pointed at the database used by another running application process.

```bash
pnpm build
pnpm monitor:restart-smoke
```

The command requires `MONGODB_URI`, `MONGODB_DATABASE` when the database is not named `vrcx`, and the existing `VRCHAT_SESSION_ENCRYPTION_KEY`. The database must already contain the encrypted authenticated VRChat session being tested. `VRCX_RESTART_SMOKE_PORT` defaults to `3100`, and `VRCX_RESTART_SMOKE_TIMEOUT_MS` defaults to `180000`. Successful execution is the evidence needed before marking the live restart acceptance item complete; unit tests validate the evidence predicate but do not replace this authenticated run.

## Visual Acceptance

The running VRCX application is the primary visual fixture. Screens must be compared at matching desktop content viewport sizes, including approximately 1280 and 1920 pixels wide, across populated, empty, loading, selected, dialog, menu, error, and disabled states. Suitable VRCX code, styles, localization, icons, and assets should be reused or closely translated when that improves fidelity. Narrow layouts at approximately 360 and 768 pixels must remain usable and recognizably VRCX rather than becoming a separate web design.

## License and Attribution

The root project reuses and adapts MIT-licensed VRCX design, code, and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and the copied license notice.
