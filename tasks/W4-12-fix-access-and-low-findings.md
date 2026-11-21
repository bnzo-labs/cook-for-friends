---
type: task
id: W4-12
status: complete
wave: 4
batch: 4d
module: platform
agent: backend-engineer
model: sonnet
depends-on: [W4-03c]
migration-owner: false
---

# W4-12 — Fix W4-03c remaining app findings: G-3 (MED), G-1, G-2, A-1, C-1 (LOW)

## Mission
Fix all five open app-layer findings from `tasks/W4-03c-final-security-review.md` that are not yet merged. No schema migration required.

## Context loading (in order)
1. `CLAUDE.md` · 2. this file · 3. `tasks/W4-03c-final-security-review.md` (findings G-3, G-1, G-2, A-1, C-1 + post-launch backlog table)
4. `docs/CONTRACT.md` §3.7

## Ownership
- `apps/web/src/app/api/payload-locked-documents/[[...rest]]/route.ts` (new — G-3 shadow route)
- `apps/web/src/app/api/payload-locked-documents/__tests__/route.test.ts` (new — G-3 unit test)
- `apps/web/src/modules/identity/collections/users.ts` (G-1 cookie secure)
- `apps/web/src/payload.config.ts` (G-2 csrf)
- `apps/web/src/modules/catalog/collections/sessions.ts` (A-1 cancel-transition guard)
- `apps/web/src/modules/catalog/fields/money.ts` (C-1 cents max)
- `apps/web/src/modules/catalog/__tests__/validators.test.ts` (unit tests G-1 config check, A-1, C-1)

## Acceptance criteria
- [x] G-3: `GET/POST/DELETE /api/payload-locked-documents` returns 404 for unauthenticated and customer requests; staff requests forwarded to Payload. Integration test proves customer → 404, staff → 200.
- [x] G-3: `payload-preferences` reviewed and confirmed not affected (own-only access, no change needed).
- [x] G-1: `users.ts` `auth.cookies.secure` is `true` in production, `false` otherwise.
- [x] G-2: `payload.config.ts` has `csrf: [clientEnv.NEXT_PUBLIC_SITE_URL]`.
- [x] A-1: `enqueueSessionCancel` only queues the job on the `cancelled` status transition (`previousDoc?.status !== "cancelled"`).
- [x] C-1: `validateCents` enforces max 10_000_000 (= $100,000 in cents) and unit test passes.
- [x] `pnpm -C apps/web typecheck` exits 0.
- [x] `pnpm -C apps/web test` exits 0 (597 passed, 10 expected fail, 335 skipped).
- [ ] CI green (PR #49, pending).

## DO NOT TOUCH
`lib/observability/**`, portal player components, `.github/**`, `docs/RUNBOOK_PROD.md`.

## Operating rules
Same Wave 4 standing rules as `tasks/W4-03c-final-security-review.md` (worktree at `../cff-wt-w4-12`, Node 22, no local full build, CI is the evidence, never force-push, never merge, PR `fix(W4-12): …`, commits end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`).

## Communication
Caveman. English only.

## Completion notes

All 5 findings fixed in a single commit `5b2b0ac`. PR #49 open, not merged.

**G-3 implementation detail:** `@payloadcms/next/routes` does not export `REST_PUT` from its main index; only `REST_GET/POST/DELETE/PATCH/OPTIONS` are available. The `payload-preferences` collection uses its own `preferenceAccess` function scoped to `req.user.id` and needed no change.

**G-1 implementation detail:** Changing `auth: true` to `auth: { cookies: { ... } }` required updating the G-1 unit test to cast through `as any` since `IncomingAuthType` doesn't expose a typed cookie shape.

**Test isolation note:** Route test for G-3 required `vi.hoisted()` for mock variables (factory hoisting issue) and a selective barrel mock for `@/modules/identity` to avoid transitive Payload DB dependencies in test context. 10 new tests all pass.

**CI:** Secret scan passed. Main CI job (Lint·Typecheck·Test·Build) and Vercel deploy pending at time of task completion.
