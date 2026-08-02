# VRCX Next.js Port

This repository is a local-first, single-user Next.js port of [VRCX](https://github.com/vrcx-team/VRCX). The goal is to reproduce VRCX's eligible behavior and UI as exactly as the browser platform permits while running continuous VRChat API monitoring on the server and storing durable application data in MongoDB.

The original source in `./VRCX/` is the behavior, implementation, and visual reference. The root application is the maintained port and must build and run without the reference checkout.

## Current Status

The MongoDB foundation, encrypted server-owned VRChat session, monitor leadership, Pipeline connection, scheduled friend/notification reconciliation, activity projections, and remote-derived Game Log session storage are implemented. Durable prototype settings and graph state no longer use browser storage. The explicitly excluded Dashboard route and navigation entry have been removed.

This remains an in-progress port: several remote workflows still call VRChat interactively instead of reading complete MongoDB projections, and screen-by-screen visual parity work is not finished. See [PLANS.md](./PLANS.md) for the remaining acceptance work.

## Target Product

- One trusted operator and one active VRChat identity; no application accounts, roles, or multi-tenant behavior.
- A long-running Next.js/Node.js server that maintains the VRChat Pipeline connection and performs scheduled HTTP API reconciliation even when no browser is open.
- MongoDB as the source of truth for settings, synchronization state, snapshots, feed and friend history, notifications, favorites, tags, memos, caches, graph data, and other durable VRCX state.
- A React UI ported from VRCX's views, components, styles, assets, strings, and interactions, with matched-viewport visual comparison as the acceptance standard.
- A VRCX-faithful Game Log session view populated from continuously observed remote location state and MongoDB history.
- Browser adaptations only where required, with each material difference documented.

## Scope Boundary

Features available from remote VRChat APIs, continuously observed remote state, MongoDB history, or standard browser capabilities are generally eligible. This includes server-derived Feed, Friend Log, previous-location history, Game Log sessions, and charts when the remote observations can support them truthfully. Dashboard is an explicit product-scope exception and will not be ported.

Game Log implements only VRCX's session presentation. The server derives sessions from API-observed changes to the active account's location and stores observed boundaries, duration, world/group metadata, current state, and provenance in MongoDB. The flat table and local-log player join/leave, portal, video, resource, external, and arbitrary event rows are intentionally absent. Their filters and the sessions/table switch are not shown.

Other features that require a locally installed or running VRChat client remain excluded: Photon Player List, screenshot Gallery, OpenVR/overlay support, Steam/registry/process control, local OSC, launch/attach, IPC, Electron window/tray behavior, and the desktop updater. Excluded controls must not appear as broken placeholders.

## Target Runtime

The final deployment requires:

- a persistent Node.js process rather than a request-only or scale-to-zero serverless host;
- MongoDB reachable only from the application server;
- outbound access to the approved VRChat API and realtime endpoints;
- a trusted private network, preferably behind HTTPS.

One monitor leader owns the active VRChat session, realtime connection, background reconciliation, and retention jobs. MongoDB-backed leadership prevents duplicate monitoring if more than one application process exists.

## Security Boundary

- The deployment intentionally has no separate application authentication or authorization layer, so it must not be exposed directly to the public internet.
- VRChat credentials, cookies, tokens, MongoDB connection strings, and encryption keys remain server-side and must never enter browser storage or logs.
- Restart-persistent VRChat session material is encrypted with AES-256-GCM before storage in MongoDB; its encryption key is configured outside MongoDB and the repository.
- Upstream requests use typed, fixed-host, allowlisted service boundaries rather than a general-purpose proxy.
- Single-user operation does not remove normal XSS, CSRF, request-forgery, validation, cache, and secret-handling requirements.

## Development

The current prototype uses Node.js 20+ and pnpm 11+:

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

For deterministic responsive screenshots, start the development-only MongoDB fixture in one terminal and capture the ported reference screens in another:

```bash
pnpm exec playwright install chromium
pnpm visual:fixture
pnpm visual:capture
```

The capture command writes ignored images under `.visual/` for Friends Locations, Feed, Friend Log, Friend List, User Dialog, Notifications, Game Log, Search, Favorite Friends, Favorite Worlds, Favorite Avatars, Moderation, and My Avatars at 360, 768, 1280, and 1920 pixels wide, and fails on page-level horizontal overflow. The fixture uses only synthetic records and disables the always-on monitor in development; production startup cannot use this bypass. These images make the current port reproducible but do not replace matched screenshots from the running VRCX reference application.

MongoDB migrations are versioned in `schema_migrations` and run automatically and idempotently when the application first accesses the database. `GET /api/health` is the deployment health probe; it returns HTTP 503 without exposing driver details when MongoDB is unavailable.

Production must run as a persistent Node.js process:

```bash
pnpm build
pnpm start
```

Do not deploy to a scale-to-zero or request-only runtime. Back up both MongoDB and `VRCHAT_SESSION_ENCRYPTION_KEY`; the database backup alone cannot decrypt the retained session. A standard backup and restore flow is:

```bash
mongodump --uri="$MONGODB_URI" --db="$MONGODB_DATABASE" --archive=vrcx.archive --gzip
mongorestore --uri="$MONGODB_URI" --nsInclude="$MONGODB_DATABASE.*" --archive=vrcx.archive --gzip
```

Test restores against a separate database before relying on them. Stop application writers or otherwise take a consistent database snapshot during recovery. Never commit archives, environment files, or encryption keys.

## Visual Acceptance

The running VRCX application is the primary visual fixture. Screens must be compared at matching desktop content viewport sizes, including approximately 1280 and 1920 pixels wide, across populated, empty, loading, selected, dialog, menu, error, and disabled states. Suitable VRCX code, styles, localization, icons, and assets should be reused or closely translated when that improves fidelity. Narrow layouts at approximately 360 and 768 pixels must remain usable and recognizably VRCX rather than becoming a separate web design.

## License and Attribution

The root project reuses and adapts MIT-licensed VRCX design, code, and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and the copied license notice.
