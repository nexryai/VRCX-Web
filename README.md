# VRCX Next.js Port

This repository is a local-first, single-user Next.js port of [VRCX](https://github.com/vrcx-team/VRCX). The goal is to reproduce VRCX's eligible behavior and UI as exactly as the browser platform permits while running continuous VRChat API monitoring on the server and storing durable application data in MongoDB.

The original source in `./VRCX/` is the behavior, implementation, and visual reference. The root application is the maintained port and must build and run without the reference checkout.

## Current Status

The root application is an earlier browser-session prototype. It already contains partial VRChat API routes and screens for login, friends, favorites, notifications, moderation, avatars, activity, Dashboard, and mutual friends, but it does not yet satisfy the current architecture or parity standard. Dashboard is now outside the product scope, so that prototype route will be removed rather than ported further.

In particular, browser-owned polling and `localStorage` persistence must be replaced by the always-on monitor and MongoDB, and the existing UI must be rebuilt where it differs from VRCX. See [PLANS.md](./PLANS.md) for the migration roadmap and acceptance criteria.

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
- Restart-persistent VRChat session material, when implemented, is encrypted before storage in MongoDB; its encryption key is configured outside MongoDB and the repository.
- Upstream requests use typed, fixed-host, allowlisted service boundaries rather than a general-purpose proxy.
- Single-user operation does not remove normal XSS, CSRF, request-forgery, validation, cache, and secret-handling requirements.

## Development

The current prototype uses Node.js 20+ and pnpm 11+:

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

MongoDB configuration and migration commands will be documented when Milestone 1 in [PLANS.md](./PLANS.md) is implemented. Until then, existing prototype configuration remains in `.env.example`; do not interpret it as the finished always-on deployment contract.

## Visual Acceptance

The running VRCX application is the primary visual fixture. Screens must be compared at matching desktop content viewport sizes, including approximately 1280 and 1920 pixels wide, across populated, empty, loading, selected, dialog, menu, error, and disabled states. Suitable VRCX code, styles, localization, icons, and assets should be reused or closely translated when that improves fidelity. Narrow layouts at approximately 360 and 768 pixels must remain usable and recognizably VRCX rather than becoming a separate web design.

## License and Attribution

The root project reuses and adapts MIT-licensed VRCX design, code, and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and the copied license notice.
