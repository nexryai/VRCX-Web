# AGENTS.md

## Project Mission

Build a browser-based port of VRCX that preserves the original application's experience wherever the browser platform allows it. The original VRCX source in `./VRCX/` is the source code from which features must be ported, as well as the primary product, interaction, and visual reference. The destination web application lives at the repository root and currently uses Next.js, React, TypeScript, Tailwind CSS, and Biome.

This file applies to the entire repository except the nested `./VRCX/` reference checkout. Treat that checkout as read-only input: do not modify it as part of the web port unless a task explicitly requires updating the reference itself. Do not make the web application depend on `./VRCX/` being present at build time or runtime.

## Non-Negotiable Product Rules

1. Preserve VRCX's UI and design with the smallest practical changes.
   - Match its information architecture, terminology, colors, spacing, typography, icons, component states, and interaction patterns.
   - Reuse suitable VRCX code and assets when that produces the most faithful result.
   - Adapt only where browser constraints, accessibility, or responsive layout require it.
   - Do not redesign a screen merely to make it look more like a conventional website.
2. Do not port features that require a local VRChat installation, the VRChat process, Steam, OpenVR, Windows-only APIs, Electron, the local filesystem, registry access, named pipes, or local VRChat log/config files.
   - Omit these features from navigation and settings instead of showing permanently broken controls.
   - A feature is eligible only when it can work through browser capabilities and server-side access to remote services.
3. Every user-facing screen must be responsive.
   - Support narrow mobile viewports, tablets, laptops, and wide desktop displays.
   - Preserve VRCX's desktop layout at larger widths; use intentional reflow, drawers, stacked panes, or horizontal scrolling at smaller widths.
   - Never rely on hover alone. Interactive targets must remain usable with touch and keyboard input.
4. Do not implement a custom authentication or authorization system for this application.
   - The deployment is intended for a trusted network. Do not add application accounts, registration, password reset, roles, invitations, access-control middleware, or an identity-provider integration unless the user changes this requirement.
   - VRChat authentication required to call VRChat services is not “custom authentication.” Keep that integration narrowly scoped and never expose VRChat credentials, auth cookies, API keys, or session material to logs or client-readable storage unnecessarily.

## Sources of Truth

Use the following priority order when requirements appear ambiguous:

1. The user's current request.
2. This `AGENTS.md` and the accepted decisions in `PLANS.md`.
3. The original VRCX behavior and source under `VRCX/`.
4. Existing web-port conventions in the root application.

Before porting a screen, inspect the corresponding VRCX view, component, styles, store, and API usage. Port the applicable implementation into the root web application instead of recreating the feature from memory. Record any intentional behavioral or visual difference in `PLANS.md`.

## Reference-to-Web Porting Workflow

For each feature, use `./VRCX/` as the starting point:

1. Locate the complete reference path through `VRCX/src/views`, `VRCX/src/components`, `VRCX/src/styles`, `VRCX/src/stores`, `VRCX/src/coordinators`, `VRCX/src/queries`, `VRCX/src/api`, `VRCX/src/services`, and related types/localization.
2. Separate remote, reusable behavior from Electron, native, filesystem, database, process, or local-game dependencies.
3. Decide whether the feature is `Web-compatible`, `Adaptable`, `Local-only`, or `Unclear` before implementation.
4. Copy or translate the applicable implementation into the root Next.js application. Vue components and Pinia state will usually need a faithful React/TypeScript equivalent; styles, constants, pure utilities, API mappings, strings, and assets may often be reused more directly.
5. Preserve the original component boundaries, data semantics, interaction states, and appearance unless the destination architecture or a documented browser constraint requires a change.
6. Add responsive behavior and browser-safe service boundaries, then compare the result with the corresponding VRCX implementation.
7. Record source paths, excluded local-only behavior, and intentional differences in the relevant plan entry or implementation comments.

Do not import application modules directly from the nested `./VRCX/` checkout. Port them into maintained root source paths so the web app remains independently buildable and the adaptation can be reviewed and tested.

## Portability Gate

Classify a proposed feature before implementing it.

| Classification | Criteria | Action |
| --- | --- | --- |
| Web-compatible | Uses the VRChat API or another remote HTTP service and can run safely through the web architecture | Port it |
| Adaptable | Has a useful remote/browser-backed core but includes optional desktop integration | Port only the web-compatible core and document the omitted behavior |
| Local-only | Depends on a local VRChat client/process, local files or logs, OpenVR, IPC, registry, or OS integration | Do not port it |
| Unclear | Dependencies or browser feasibility have not been verified | Investigate and record a decision before coding |

Do not add mock buttons or nonfunctional placeholders for excluded features. Test fixtures and development mocks are allowed when clearly isolated from production behavior.

## UI Porting Rules

- Treat VRCX screenshots and running behavior as visual acceptance references, and treat `./VRCX/` as the implementation source to port from.
- Prefer shared design tokens for colors, spacing, radii, shadows, typography, and breakpoints. Values should be derived from VRCX rather than invented ad hoc.
- Preserve original labels and hierarchy where they make sense in a browser. Reuse existing localization strings when licensing and format permit.
- Keep loading, empty, error, selected, disabled, hover, focus, and active states consistent with VRCX.
- Retain dense desktop information presentation. On small screens, prioritize content without silently dropping important information.
- Use semantic HTML and accessible names. Maintain visible keyboard focus, logical tab order, adequate contrast, and reduced-motion support without needlessly changing the visual identity.
- Avoid one-off “temporary” styling when the pattern is shared by more than one screen; extract the shared primitive or token.
- When copying code or assets, preserve applicable copyright and license notices. The reference VRCX project is MIT-licensed; include the required notice for copied or substantial portions and record provenance where it would otherwise become unclear.

## Responsive Acceptance Baseline

Unless a task defines stricter targets, verify each major screen at approximately:

- 360 px: narrow mobile
- 768 px: tablet
- 1280 px: standard desktop
- 1920 px: wide desktop

At each width, check navigation access, overflow, dialogs, tables/lists, touch targets, text wrapping, and fixed/sticky elements. Horizontal scrolling is acceptable for intrinsically wide data tables when accompanied by a usable narrow-screen presentation; page-level accidental overflow is not.

## Architecture and Security Boundaries

- Keep browser-only APIs inside client components. Prefer server components for non-interactive composition and server-only code for secrets and privileged upstream calls.
- Put external-service access behind typed service boundaries. UI components must not embed raw endpoint construction or credential handling.
- Centralize request errors, rate-limit handling, retry policy, and session-expiry behavior.
- Validate untrusted upstream data at the boundary. Never render upstream HTML without explicit sanitization.
- Do not persist secrets in `localStorage`, source files, committed environment files, or client bundles.
- The trusted-network assumption removes the need for a separate application login; it does not remove normal protections against XSS, CSRF, credential leakage, unsafe proxying, or accidental public deployment.
- Do not create an unrestricted generic proxy. Server routes must allow only the required upstream hosts, methods, headers, and paths.
- Keep dependencies minimal. Prefer the current stack and existing utilities before adding a package.

## Code Quality and Comments

- Use TypeScript with precise domain types. Avoid `any`; validate data that crosses a network or storage boundary.
- Keep components focused and move reusable domain behavior out of presentation components.
- Comment frequently enough that non-obvious decisions remain understandable.
- Write comments in English.
- Comments should explain why a browser adaptation exists, why behavior differs from VRCX, subtle state transitions, security constraints, upstream quirks, and provenance of substantially reused logic.
- Do not add comments that merely restate straightforward code. Update or remove comments when the code changes.
- Mark follow-up work with a specific reason and, when available, an issue or plan reference. Avoid context-free `TODO` comments.
- User-facing text and documentation must be written in English unless localization work explicitly requires another language.

## Testing and Verification

For every change, run the smallest relevant checks during development and the full applicable checks before handoff:

```bash
npm run lint
npm run build
```

Add tests as test infrastructure and features are introduced. Prioritize tests for:

- service-boundary parsing and error mapping;
- state transitions and data transformations;
- responsive navigation and high-value user flows;
- regression cases for ported VRCX behavior;
- security-sensitive server routes.

Manually compare ported UI with VRCX and verify the responsive baseline. A successful desktop screenshot alone is not sufficient acceptance.

## Git Workflow

- Commit frequently: create a small, focused commit after each coherent, verified increment.
- Write all commit subjects and bodies in English.
- Use an imperative subject that explains the change, for example `Add responsive friend list shell`.
- Keep formatting-only changes, refactors, infrastructure work, and feature behavior in separate commits when practical.
- Do not combine unrelated changes in a single commit.
- Before committing, inspect the diff and run the checks relevant to that increment.
- Do not commit secrets, local environment files, build output, dependency caches, or unrelated changes already present in the worktree.
- Do not rewrite, squash, amend, or discard another contributor's work unless explicitly requested.

## Planning and Handoff

- Use `PLANS.md` as the living roadmap and decision log.
- Update the plan when scope, feature eligibility, architecture, or acceptance criteria change.
- Mark work complete only after implementation and verification, not when code has merely been written.
- In handoffs, state what changed, what was verified, any deliberate difference from VRCX, and the next unresolved risk.
