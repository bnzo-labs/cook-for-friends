---
type: task
id: W4-10
status: pending
wave: 4
batch: 4d
module: portal
agent: frontend-architect
model: sonnet
depends-on: [W4-03c]
migration-owner: false
---

# W4-10 — Fix: Mux Data tracking cookie without consent (W4-03c F-4, MEDIUM, not accepted for launch)

## Mission
`<MuxPlayer>` in `apps/web/src/components/portal/player/MuxStage.tsx` runs Mux Data with defaults: a persistent first-party `muxData` cookie (random viewer id, multi-year) plus viewing analytics. Law 25 s.8.1: non-essential tracking off by default; the site has no consent banner. Make the player set **no cookie**.

## Context loading (in order)
1. `CLAUDE.md` · 2. this file · 3. `tasks/W4-03c-final-security-review.md` (area F)
4. `@mux/mux-player-react` props `disableCookies`, `disableTracking` (Context7 / Mux docs)

## Ownership
`src/components/portal/player/**` (portal), `apps/web/e2e/w4-10-*.test.ts`.

## Acceptance criteria
- [ ] `MuxStage` passes `disableCookies` (default choice: keeps Mux QoS beacons, no cookie). If Erick prefers no Mux Data at all: `disableTracking` and drop `https://*.litix.io` from CSP connect-src in a separate platform change (not here).
- [ ] Unit or e2e proof: after the player mounts and plays (fake provider is fine — assert the prop is passed; real Mux cookie behaviour can't run in CI), `document.cookie` has no `muxData`.
- [ ] No other `set-cookie`/`document.cookie` writer added.
- [ ] CI green.

## DO NOT TOUCH
`apps/web/src/lib/security-headers.ts`, migrations, `docs/**`, `.github/**`.

## Operating rules
Same Wave 4 standing rules as `tasks/W4-03c-final-security-review.md` (worktree, Node 22, no local full build, CI is the evidence, never force-push, never merge, PR `fix(W4-10): …`, commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Completion notes
