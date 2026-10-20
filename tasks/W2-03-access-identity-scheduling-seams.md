---
type: task
id: W2-03
status: pending
wave: 2
module: access, identity, scheduling, _shared (TxContext only)
agent: backend-engineer
model: sonnet
depends-on: []
---

# W2-03 — Entitlements API, generic rate limit, seat-released seam, `TxContext`

## Mission
Ship the small cross-module functions commerce needs in Wave 2: `access` entitlement functions (CONTRACT §4), a generic `identity.consumeRateLimit` (CCR-W2-2) for checkout, the `scheduling.onSeatReleased` seam, and the shared `TxContext` type. All transaction-aware.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry)
3. This file
4. `docs/CONTRACT.md` §2, §3.2, §3.3, §3.5, §4 (`access`, `identity`, `scheduling`, `TxContext` note), §7
5. `docs/MASTER_BUILD_SPEC.md` §4 rule 1 (access decoupled from payment)
6. `apps/web/src/modules/identity/server/rate-limit.ts`, `apps/web/src/modules/access/collections/entitlements.ts`, `apps/web/src/modules/scheduling/collections/waitlist-entries.ts`

## Contract Change Request (CCR-W2-2) — assumed approved at plan review
Additive to `@/modules/identity`, **no schema change** (reuses `auth-rate-limits`; namespace is mixed into the hashed key so counts stay independent of magic-link limits):
```ts
export function consumeRateLimit(i: { scope: 'ip' | 'email'; namespace: string; key: string; limit: number; windowSeconds: number }):
  Promise<{ allowed: boolean; retryAfterSeconds: number }>
// keyHash = sha256(`${namespace}:${normalizedKey}`); insert-then-count (race-safe), same pruning as today.
```

## Acceptance criteria
- [ ] `src/modules/_shared/types.ts` exports `export type TxContext = { req: PayloadRequest }` (CONTRACT §4 note). Nothing else in `_shared` changes.
- [ ] `@/modules/access` exports `hasActiveEntitlement`, `listActiveEntitlements`, `grantEntitlement`, `revokeEntitlement` with CONTRACT §4 signatures and an exported `EntitlementView` type.
- [ ] `hasActiveEntitlement` is true only when `validFrom <= at`, (`validUntil` null or `> at`) and `revokedAt` null. Unit-tested edge cases (boundary instants).
- [ ] `grantEntitlement` is idempotent on `(customer, course, source, sourceRef)`: a second call (sequential **and** concurrent `Promise.all` ×5) returns the same entitlement and leaves exactly one row. A revoked existing row is returned as-is (not un-revoked) — documented in JSDoc.
- [ ] Multi-seat (D9 change 2026-10-19, CCR-W2-6): one order grants one `purchase` entitlement **per attendee customer** with the same `sourceRef`. Test: same `course` + `source` + `sourceRef`, three different customers (incl. concurrent `Promise.all`) → three rows; `revokeEntitlement` for one customer leaves the other two active. No code change expected (unique key already includes `customer`) — the test pins it.
- [ ] `revokeEntitlement` sets `revokedAt` + `revokedReason`; idempotent; missing row → `NOT_FOUND`.
- [ ] With `tx` passed, writes join the caller's transaction: test opens a Payload transaction, grants, rolls back → no row.
- [ ] `identity.consumeRateLimit` per CCR-W2-2. The magic-link limiter is refactored onto it with **identical** behaviour; all existing identity tests (96-suite) still pass unchanged. New tests: namespaces isolated; limit+1 call denied with `retryAfterSeconds > 0`; 10 concurrent calls with limit 5 → exactly 5 allowed.
- [ ] `@/modules/scheduling` exports `onSeatReleased(sessionId: ID): Promise<void>`. Wave 2 behaviour (orchestrator decision, not a mock): count `waitlist-entries` with `status: 'waiting'` for the session; 0 → return; >0 → structured warn log `waitlist.notify.pending` with sessionId and count (no PII). JSDoc states W3-05 adds notification. Never throws for a valid id. Integration-tested.
- [ ] No migration, no collection field change. Integration suite passes locally on a throwaway branch; CI green; Vercel deploy Ready.

## Implementation steps
1. Worktree + env copy, throwaway Neon branch from `dev`.
2. `TxContext` in `_shared/types.ts`.
3. `access/server/entitlements.ts` + `access/types.ts`; export from `access/index.ts`. Use Local API with `req: tx?.req` so Payload reuses the transaction; handle the unique violation by re-reading.
4. `identity/server/rate-limit.ts`: extract generic core, keep magic-link wrappers; export `consumeRateLimit` from `identity/index.ts`.
5. `scheduling/server/seat-released.ts`; export from `scheduling/index.ts`.
6. Tests per module `__tests__/`. Push, CI, Vercel Ready.

## Files to create / edit
- Edit: `apps/web/src/modules/_shared/types.ts` (TxContext only — exception, platform-owned file, no other task edits it this wave).
- Create/edit: `apps/web/src/modules/access/{index.ts,types.ts,server/*.ts,__tests__/entitlements.test.ts}`.
- Edit: `apps/web/src/modules/identity/{index.ts,server/rate-limit.ts}`, create `apps/web/src/modules/identity/__tests__/rate-limit-generic.test.ts`.
- Create/edit: `apps/web/src/modules/scheduling/{index.ts,server/seat-released.ts,__tests__/seat-released.test.ts}`.

## DO NOT TOUCH
- Any `collections/**` file, `src/migrations/**`, `src/payload-types.ts`, `payload.config.ts`.
- `identity/server/ports.ts` (W2-05 edits it next batch), magic-link routes, strategy.
- `messages/*.json` (no customer-facing strings here).

## Erick handoffs
- Approve CCR-W2-2 at plan review.

## Done when
All criteria ticked, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-03 -b w2-03 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally. Never commit `apps/web/AGENTS.md` or `apps/web/CLAUDE.md` generated by `next dev`.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after. CI creates its own branch per run.
- Migrations: Neon `dev` first, then `staging`. **Never Neon `production`.**
- Verify on the real target: final HTTP 200 + expected content. A 307 is not "loads". Staging is Vercel-auth protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`.
- After pushing: CI green **and** Vercel prod deploy `Ready` (`vercel ls`; failure reason via `vercel api /v13/deployments/<id>`).
- `messages/{fr,en}.json` is shared: add keys only under your own namespace; on rebase conflict keep both sides.
- Rebase on `origin/main`, push to `main`. Small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.
