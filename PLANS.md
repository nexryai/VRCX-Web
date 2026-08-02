# VRCX Web Port Plan

## Purpose

This document is the living implementation plan for a browser-based VRCX port. It should be updated as investigation resolves unknowns. The goal is to port the applicable source code from `./VRCX/` into a faithful, responsive web application for features that can operate without a locally installed or running VRChat client.

## Product Constraints

- `./VRCX/` is the read-only source checkout from which the root web application is ported. It is the primary implementation, visual, and behavioral reference.
- The root web application must build and run independently; it must not import from or require the nested reference checkout at build time or runtime.
- Make only the changes required by the browser platform, responsive layout, accessibility, and security.
- Reuse VRCX code and assets when practical, while retaining required MIT license notices and recording provenance.
- Exclude all features whose useful operation depends on local VRChat files, logs, processes, Steam, OpenVR, Electron, Windows APIs, IPC, or other desktop-only integrations.
- Support mobile, tablet, desktop, and wide desktop layouts.
- Do not build a separate application account, authorization, or access-control system. Support only the VRChat session flow required for remote VRChat functionality.
- Write documentation, code comments, and Git commit messages in English.
- Deliver work in small, verified commits.

## Definition of Done

The initial web port is ready when:

1. Supported VRCX workflows are inventoried and every candidate feature has an explicit portability decision.
2. Users can establish and recover the VRChat API session needed by supported features without a separate VRCX Web account system.
3. The implemented navigation, shell, shared components, and feature screens closely match VRCX at desktop widths.
4. Every implemented workflow remains usable at 360, 768, 1280, and 1920 px viewport widths.
5. Local-only features are absent from the production UI and do not leave broken routes or controls.
6. Credentials and session material remain server-side or in appropriately protected cookies; sensitive data is not logged or bundled into the client.
7. Loading, empty, failure, rate-limit, and expired-session states are handled consistently.
8. Lint, production build, relevant automated tests, and manual responsive checks pass.
9. Copied VRCX code and assets retain the notices required by the MIT license.
10. The roadmap and decision log accurately describe the shipped behavior and known gaps.

## Feature Eligibility Inventory

The initial source audit below records the production scope. A feature marked `Adaptable` is ported without the listed local-only subfeatures; it is not deferred indefinitely.

| Area | Decision | Reference evidence and web-port direction |
| --- | --- | --- |
| Login, VRChat session, TOTP/OTP/email OTP, and logout | Web-compatible | Port `VRCX/src/views/Login`, `stores/auth.js`, `api/auth.js`, and the `auth/user` flow through server-only routes; omit saved passwords and custom endpoints initially |
| Main layout, navigation, responsive friend sidebar, dialogs, themes, and supported settings | Adaptable | Port `views/Layout`, `views/Sidebar`, `components/nav-menu`, and `styles`; omit Electron window, updater, tray, local-game, VR, and native notification settings |
| Friends Locations and remote friend presence | Adaptable | Port `views/FriendsLocations`, remote friend/location stores, and relevant dialogs; omit launch/attach controls and replace local-only favorites with browser-safe persistence where useful |
| Search for users, worlds, groups, and avatars | Web-compatible | Port `views/Search` and its API-backed composables; keep all requests behind the allowlisted server boundary |
| Favorite friends, worlds, and avatars | Adaptable | Port `views/Favorites` and remote favorite APIs; use browser-safe import/export and persistence, omitting arbitrary filesystem access and local avatar history derived from the desktop database |
| Friend List | Web-compatible | Port `views/FriendList`, `api/friend.js`, and supported user details/actions |
| Moderation | Web-compatible | Port `views/Moderation`, `api/playerModeration.js`, and supported moderation actions |
| Notifications and invite responses | Web-compatible | Port `views/Notifications`, `api/notification.js`, and remote response flows; browser notifications are a separate optional adaptation |
| My Avatars | Adaptable | Port remote avatar management and browser upload/crop flows from `views/MyAvatars`; omit desktop-database avatar history and filesystem-only operations |
| Feed and Friend Log | Adaptable | Port remote events and history from `views/Feed` and `views/FriendLog` using web/server persistence; omit entries derived only from local VRChat logs |
| Dashboard | Adaptable | Port `views/Dashboard` after supported widgets exist; do not expose widgets backed only by excluded local features |
| Mutual Friends chart | Adaptable | Port the remote mutual-friends graph from `views/Charts/components/MutualFriends.vue`; replace desktop database caching with a web-safe store |
| Instance Activity and Hot Worlds charts | Excluded in current form | Their source implementations read the desktop activity database populated by local observation; reconsider only if an equivalent remote-only data source is proven |
| Game Log | Local-only | Exclude `views/GameLog`, `services/gameLog.js`, and local VRChat log watchers |
| Player List and Photon data | Local-only | Exclude `views/PlayerList` and live local-game/photon processing |
| Gallery and Screenshot Metadata | Local-only | Exclude screenshot-directory watching and arbitrary local-file metadata tooling |
| VR overlay, OpenVR, OSC, Steam, registry, launch/attach, process, IPC, window, and tray integration | Local-only | Do not port these modules or show their controls |
| Application updater | Local-only | Use normal web deployment and omit Electron updater UI |
| Browser-safe application preferences and import/export | Web-compatible | Use protected browser/server storage and explicit browser downloads/uploads; never require arbitrary filesystem access |

## Delivery Strategy

Each milestone should be split into small vertical slices. A normal slice starts by tracing the implementation in `./VRCX/`, then includes an eligibility decision, source-path notes, ported types/service logic, UI states, responsive behavior, verification, a plan update when needed, and a focused English commit.

### Milestone 0 — Reference Audit and Baseline

Status: In progress

- [x] Establish repository-wide contribution and porting rules in `AGENTS.md`.
- [x] Establish the initial roadmap and constraints in `PLANS.md`.
- [x] Map the top-level VRCX routes, default navigation, views, API modules, service boundaries, style tokens, icons, and English localization resources.
- [x] Create a feature inventory with `Web-compatible`, `Adaptable`, or `Local-only` decisions and evidence paths into `VRCX/`.
- [x] Define destination root source paths for ported views, shared UI, domain state, upstream API code, and reused assets; never import production modules from `./VRCX/`.
- [x] Identify initial reused code/assets and distribute the VRCX MIT notice in `THIRD_PARTY_NOTICES.md`.
- [ ] Capture desktop visual references for the first supported screens.
- [ ] Record the browser support policy and test viewport matrix.

Exit criteria: the first implementation slice has a documented VRCX reference, confirmed remote data path, scope boundary, and visual acceptance target.

### Milestone 1 — Web Foundation and VRCX Shell

Status: In progress

- [x] Replace starter metadata, fonts, colors, and global styles with initial VRCX-derived equivalents.
- [x] Define the initial shared tokens for color, typography, spacing, radii, motion, and responsive breakpoints.
- [x] Build the first responsive application shell, navigation, header, content region, mobile overlay, and feedback states.
- [x] Preserve VRCX's desktop navigation at wide sizes and introduce a compact drawer at narrow sizes.
- [ ] Add core reusable primitives needed by the first feature: buttons, inputs, tabs, list/table patterns, menus, dialogs, tooltips, skeletons, empty states, and errors.
- [x] Establish typed server-only boundaries and documented environment configuration.
- [x] Add unit test infrastructure for root web-port code without collecting tests from the reference checkout.
- [ ] Add automated checks for accidental horizontal page overflow and key navigation accessibility where practical.

Exit criteria: a faithful VRCX shell renders at all baseline widths, shared primitives cover the first feature, and lint/build/tests pass.

### Milestone 2 — VRChat Remote Session and API Boundary

Status: In progress

- [ ] Confirm the VRChat API integration requirements and document upstream constraints before implementation.
- [x] Define a typed, allowlisted server-side VRChat service boundary; do not create a general-purpose proxy.
- [x] Implement the minimum VRChat login/session, two-factor challenge, session validation, expiry recovery, and logout behavior required by the first supported feature.
- [x] Store session material in secure, HTTP-only cookies or an equivalently protected server-side mechanism.
- [x] Prevent credentials, cookies, tokens, and sensitive response fields from entering logs, error pages, analytics, or client-readable state.
- [x] Implement normalized errors for offline/upstream failure, invalid session, forbidden action, rate limiting, and unexpected responses.
- [ ] Complete boundary validation, retry policy, route-level security tests, and CSRF review as more upstream routes are added.
- [x] Document that this session flow is VRChat integration, not a separate VRCX Web authentication system.

Exit criteria: a user can establish and terminate the required VRChat session, failure states are recoverable, and no custom application identity system exists.

### Milestone 3 — First Complete Remote Workflow

Status: In progress — Friends Locations selected

Select the first workflow after the inventory. Prefer a frequently used, clearly remote-backed workflow such as friend browsing and user details.

- [x] Port the Friends Locations navigation entry and overview screen.
- [x] Port friend details, profile links, copy-ID, unfriend, search/filter, and refresh behavior.
- [x] Match the core VRCX friend-card, desktop shell, and sidebar layout using shared primitives.
- [x] Design narrow-screen reflow without removing core friend data.
- [x] Implement initial loading, empty, error, rate-limit, and expired-session states.
- [ ] Add service, component, and high-value flow tests.
- [ ] Compare at all baseline widths and document intentional differences from VRCX.

Exit criteria: one high-value workflow is usable end to end, visually faithful, responsive, tested, and independent of local VRChat.

### Milestone 4 — Expand Supported Remote Features

Status: Not started

Port additional areas one vertical slice at a time, in an order chosen from the verified inventory. Candidate areas include friends, notifications, groups, worlds, favorites, avatars, and remote profile actions. For each slice:

- [ ] Reconfirm feature eligibility and exclude local-only subfeatures.
- [ ] Reuse or extend service types and shared UI instead of duplicating them.
- [ ] Match all meaningful VRCX states and interactions.
- [ ] Verify responsive behavior and keyboard/touch usability.
- [ ] Add regression coverage for data mapping and key actions.
- [ ] Update the feature inventory, differences, and decision log.
- [ ] Commit each coherent slice separately with an English message.

Exit criteria: every selected feature meets the global definition of done; excluded features remain absent.

### Milestone 5 — Hardening and Release Readiness

Status: Not started

- [ ] Audit all routes for secret exposure, unsafe forwarding, input validation, XSS, CSRF, and cache mistakes.
- [ ] Test upstream outages, slow responses, session expiry, rate limiting, and malformed data.
- [ ] Test responsive layouts on representative touch and desktop browsers.
- [ ] Audit keyboard navigation, focus management, labels, contrast, motion, and screen-reader landmarks.
- [ ] Review performance for image sizing, request waterfalls, large lists, and unnecessary client-side JavaScript.
- [ ] Confirm local-only controls and dead routes are absent.
- [ ] Confirm VRCX attribution and third-party notices are complete.
- [ ] Replace the starter README with deployment, configuration, security-boundary, and operator documentation.
- [ ] Run the full lint, test, and production build suite from a clean checkout.

Exit criteria: the web port is documented, deployable on the intended trusted network, resilient to expected upstream failures, and passes release checks.

## Cross-Cutting Acceptance Checklist

Apply this checklist to every feature slice:

- [ ] The VRCX reference files and behavior were inspected.
- [ ] Relevant code was ported from `./VRCX/` into maintained root source paths rather than recreated without reference.
- [ ] The plan entry or implementation records the relevant `./VRCX/` source paths and material adaptations.
- [ ] The feature does not require local VRChat or desktop integration.
- [ ] Any omitted VRCX behavior is documented and absent from the UI.
- [ ] Desktop visuals closely match VRCX.
- [ ] Mobile and tablet layouts are intentional and usable.
- [ ] Keyboard, touch, focus, loading, empty, error, and disabled states work.
- [ ] External data is typed and validated at its boundary.
- [ ] Secrets and session data do not leak to client state or logs.
- [ ] Relevant tests, `pnpm lint`, and `pnpm build` pass.
- [ ] Non-obvious decisions have useful English comments.
- [ ] Documentation and the feature inventory are current.
- [ ] The change is committed as a small, focused commit with an English message.

## Decision Log

Use this section for decisions that affect future work. Add the date, decision, rationale, and consequences.

### 2026-08-02 — Preserve VRCX as the Design Baseline

Decision: Use the original VRCX UI and interaction model with minimal browser-specific adaptation.

Rationale: Familiarity and parity are product requirements, not merely inspiration.

Consequence: Proposed redesigns need a concrete browser, responsive, accessibility, or security justification.

### 2026-08-02 — Exclude Local VRChat Dependencies

Decision: Do not port functionality that needs a local VRChat installation, running process, local logs/files, or native OS integration.

Rationale: Such behavior cannot work reliably as a browser application and is outside the requested product scope.

Consequence: Related navigation and controls are omitted rather than disabled indefinitely.

### 2026-08-02 — No Separate Application Authentication

Decision: Do not build accounts, roles, or access control for VRCX Web. Implement only the VRChat session behavior required for supported remote features.

Rationale: The application will run on a trusted network and does not need another identity layer.

Consequence: Deployment documentation must clearly state the trusted-network assumption, while implementation still protects VRChat credentials and sessions.

### 2026-08-02 — Responsive Adaptation Is Required

Decision: Preserve the VRCX desktop experience while adding deliberate layouts for narrow screens.

Rationale: A browser port must remain useful across common viewport and input types.

Consequence: Responsive behavior is part of feature acceptance, not deferred polish.

## Open Questions

- Which browser versions and deployment runtime are required?
- Is browser notification support useful enough to port independently of Electron notifications?
- Which VRCX localization resources should be reused in the first release?
- Where should the VRCX MIT attribution and third-party notices appear in the deployed application?
