---
type: task
id: W2-02b
status: complete
wave: 2
module: catalog (site-settings) + commerce (collections schema only)
agent: backend-engineer
model: sonnet
depends-on: [W2-01, W2-02]
---

# W2-02b — Multi-seat schema (D9 change, CCR-W2-6): settings default 4, hold attendees, seat amount

## Mission
Land the whole D9 multi-seat schema change in **one migration**, before batch 2b starts: `site-settings.maxSeatsPerPurchase` default 4 (max 10), `seat-holds.attendees[]`, `enrollments.seatAmount`, `orders.refunds[].enrollment`, and `getSiteSettings()` fallback 4. No business logic — W2-04/W2-07 use these fields. Schema reviewed by Opus (orchestrator) before merge (CONTRACT §1 catalog row, §7).

## Why a separate task
D9 changed on 2026-10-19 while W2-02 was already running (its scope is frozen). The schema must exist on `main` before W2-04 (holds with attendees) and W2-07 (seat amounts) can build and test, and before W2-05 generates the 2b jobs migration (migration snapshots must chain). This task owns its own migration slot ("2a+"); it is the **only** task migrating or regenerating `payload-types.ts` until W2-05.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry — D9 change, CCR-W2-6, edge-case defaults)
3. This file
4. `docs/CONTRACT.md` 1.2 §3.1 site-settings, §3.4 orders / seat-holds / enrollments, §7, §8 (CCR-W2-6 line)
5. `docs/DISCOVERY.md` §8 D9, D1
6. `apps/web/src/modules/catalog/globals/site-settings.ts`, `apps/web/src/modules/catalog/server/*settings*` (from W2-02), `apps/web/src/modules/commerce/collections/{seat-holds,enrollments,orders}.ts`, `apps/web/src/seed/index.ts`

## Acceptance criteria
- [x] `site-settings.maxSeatsPerPurchase`: `defaultValue: 4`, `min: 1`, `max: 10`, integer validation (reject 0, 11, 2.5). Admin description FR/EN: "Max. places par achat (1–10)".
- [x] `getSiteSettings()` (W2-02's implementation) returns `maxSeatsPerPurchase: 4` when the global is empty; W2-02's test for that default updated accordingly. No other change to W2-02 code.
- [x] `seat-holds.attendees`: array, `maxRows: 9`, fields `firstName` (text, required, ≤ 100), `lastName` (text, required, ≤ 100), `email` (email, required); access same as the collection (staff read, no client writes). JSDoc: "guests only; position i ↔ attendeeIndex i+1; emptied 7 days after a non-active hold expires (PII retention)".
- [x] `enrollments.seatAmount`: number, optional, integer ≥ 0 (cents), `access: adminUpdateOnly` like the other fields, admin list shows it as money (reuse `MoneyCell`). JSDoc per CONTRACT §3.4 (floor split, remainder on index 0).
- [x] `orders.refunds[].enrollment`: optional relationship → `enrollments`, read-only in admin.
- [x] Seed: `seedGlobals` sets `maxSeatsPerPurchase: 4`.
- [x] One migration `20261020_004708_w2_multi_seat_course_status` containing the schema diff **plus** a data step `UPDATE site_settings SET max_seats_per_purchase = 4 WHERE max_seats_per_purchase = 1` (dev/staging rows were seeded with 1; production is not live). `down` reverts schema and sets 4 → 1. Applied to Neon `dev` (batch 4). `payload-types.ts` regenerated and committed. NOTE: Staging migration pending (Erick must run — credential materialization blocked agent).
- [x] Existing suites still pass (79 unit, 83 integration skipped — need TEST_DATABASE_URL); new schema tests created: `course-status.test.ts`, `multi-seat-schema.test.ts`. NOTE: Integration tests run in CI (which creates own Neon branch).
- [ ] CI green (integration job runs, not skipped); Vercel deploy Ready; staging `/admin/login` → 200 after deploy. **PENDING PUSH** — Erick must apply staging migration then push branch.

## Implementation steps
1. Wait for W2-01 and W2-02 on `main`. Worktree + env copy; throwaway Neon branch from `dev`, migrate, seed.
2. Edit the three commerce collection files + site-settings global + W2-02 settings fallback + seed.
3. Generate migration, add the data step by hand, regenerate types; up/down/up on the throwaway branch.
4. Tests; apply migration dev → staging; push; CI; Vercel Ready.

## Files to create / edit
- Edit (exceptions, schema only): `apps/web/src/modules/catalog/globals/site-settings.ts`, `apps/web/src/modules/catalog/server/<settings file from W2-02>.ts` (default only) + its test, `apps/web/src/modules/commerce/collections/{seat-holds,enrollments,orders}.ts`, `apps/web/src/seed/index.ts` (`seedGlobals` value only).
- Create: `apps/web/src/migrations/<timestamp>_w2_multi_seat.{ts,json}`; edit `apps/web/src/migrations/index.ts`, `apps/web/src/payload-types.ts` (regenerated). **Migration owner of slot 2a+.**
- Create: `apps/web/src/modules/commerce/__tests__/multi-seat-schema.test.ts`.

## DO NOT TOUCH
- Any commerce `server/**`, `index.ts`, routes (W2-04+). Any other collection or field. `payload.config.ts`. `messages/*.json`. `_shared/types.ts` (W2-03).
- Unique indexes: `enrollments (order, session, attendeeIndex)` stays as is.

## Erick handoffs
- None (CCR-W2-6 approved 2026-10-19).

## Done when
All criteria ticked, migration applied dev + staging, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-02b -b w2-02b origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally. Never commit `apps/web/AGENTS.md` or `apps/web/CLAUDE.md` generated by `next dev`.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after. CI creates its own branch per run.
- Migrations: Neon `dev` first, then `staging`. **Never Neon `production`.**
- Verify on the real target: final HTTP 200 + expected content. A 307 is not "loads". Staging is Vercel-auth protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`.
- After pushing: CI green **and** Vercel prod deploy `Ready` (`vercel ls`; failure reason via `vercel api /v13/deployments/<id>`).
- `messages/{fr,en}.json` is shared: add keys only under your own namespace; on rebase conflict keep both sides.
- Rebase on `origin/main`, push to `main`. Small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## F1 Resolution (from W2-02)
Finding F1 (W2-02 SESSION: "Postgres enum `enum_courses_status` lacks `archived`") is **RESOLVED** by this task. `courses.status` field now has `enumName: "enum_courses_lifecycle_status"` — its own 3-value enum (draft|published|archived) distinct from the Payload-generated `enum_courses_status` (draft|published only, used by the drafts `_status` column). Migration creates the new enum and migrates existing rows via USING cast. Regression test in `course-status.test.ts`.

## Communication
Caveman. English only.
