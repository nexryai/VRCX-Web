# VRCX Web

VRCX Web is a responsive browser port of the remote-capable parts of [VRCX](https://github.com/vrcx-team/VRCX). The original source in `./VRCX/` is the behavior and visual reference; the root Next.js application runs independently and does not need the reference checkout at build time or runtime.

This application is intended for a trusted private network. It does not provide application accounts, roles, or an additional access-control layer. It does establish a VRChat session for the signed-in user, so it must still be deployed and operated as sensitive software.

## Ported Features

- VRChat login, TOTP, OTP, email OTP, session recovery, and logout
- Responsive VRCX navigation, themes, Friends Locations, and online friend sidebar
- User details, friend removal, user/world/group search, and complete friend list
- VRChat friend, world, and avatar favorites with group browsing, moving, and removal
- Legacy and V2 notifications, read/hide actions, friend approval, and V2 responses
- Player moderation management
- Remote My Avatars browsing, selection, editing, impostor queueing, and deletion
- Browser-persisted Feed and Friend Log for remotely observed friend changes
- Remote-data Dashboard and an explicit, cancellable Mutual Friends graph fetch

The following VRCX areas are intentionally absent because they require local VRChat or desktop integration: Game Log, Player List/Photon data, screenshot Gallery, OpenVR and overlays, OSC, Steam/registry/process control, launch/attach, IPC, window/tray integration, and the Electron updater. See `PLANS.md` for the full eligibility inventory and remaining parity notes.

## Requirements

- Node.js 20 or later
- pnpm 11 or later
- Network access from the server to `https://api.vrchat.cloud`
- A trusted-network deployment, preferably behind HTTPS

## Configuration

Copy `.env.example` to `.env.local` and set:

```dotenv
VRCHAT_USER_AGENT="VRCX-Web/0.1.0 (operator@example.com)"
VRCHAT_COOKIE_SECURE=true
```

`VRCHAT_USER_AGENT` should contain a real operator contact. Keep `VRCHAT_COOKIE_SECURE=true` for production HTTPS. Set it to `false` only when a trusted private deployment cannot provide HTTPS; production cookies otherwise use `Secure`, `HttpOnly`, `SameSite=Strict`, and a root path.

## Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The root application is the port; do not run or modify `./VRCX/` unless working on the reference project separately.

Run the verification suite with:

```bash
pnpm test
pnpm lint
pnpm build
```

## Production

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Place the server behind a private reverse proxy with HTTPS. Preserve the original `Host` or provide correct `X-Forwarded-Host` and `X-Forwarded-Proto` headers so same-origin mutation checks can validate browser requests. Do not expose the deployment directly to the public internet: the trusted-network assumption deliberately means there is no separate VRCX Web authorization layer.

## Security Boundary

- VRChat credentials are sent only to same-origin server routes and are not stored by the application.
- VRChat session cookies are stored in protected application cookies and are never returned to client JavaScript.
- The upstream client has a fixed host and endpoint allowlist; this is not a general-purpose proxy.
- Inputs and upstream payloads are schema-validated, private responses disable caching, and mutations reject cross-site browser requests.
- Feed, Friend Log, UI preferences, and the Mutual Friends snapshot use browser storage. They contain social/activity data but never credentials or VRChat session cookies.

VRChat API behavior, availability, and rate limits remain upstream dependencies. Large Mutual Friends graphs can require many requests, so fetching starts only after an explicit user action and can be cancelled.

## Browser and Responsive Support

The supported baseline is the current stable versions of Chromium, Firefox, and Safari. Screens are designed for approximately 360, 768, 1280, and 1920 pixel widths. Wide data tables retain a mobile card layout or an intentional local horizontal scroller.

## License and Attribution

The root project reuses and adapts MIT-licensed VRCX design, code, and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and the copied license notice.
