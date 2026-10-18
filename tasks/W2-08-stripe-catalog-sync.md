---
type: task
id: W2-08
status: pending
wave: 2
module: commerce (sync) + catalog courses hook
agent: backend-engineer
model: sonnet
depends-on: [W2-02, W2-04, W2-05]
---

# W2-08 — One-way Stripe catalog sync (courses + discount codes)

## Mission
Publishing or repricing a course in Payload creates/updates its Stripe Product and Price automatically; discount codes sync to Stripe Coupons + Promotion Codes. Staff never open Stripe (MASTER §4 rule 5). This task owns the **only Wave 2 migration in batch 2c** (two job task slugs).

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + W2-04/W2-05 entries)
3. This file
4. `docs/CONTRACT.md` §3.1 courses, §3.4 discount-codes, §4 `commerce.syncCourseToStripe` + catalog CCR-W2-1 (`tasks/W2-02-catalog-read-api.md`), §5.3 (whole), §6 internal jobs
5. `docs/DISCOVERY.md` §2 (`plugin-stripe` rejected, stripe pin), §4 (Stripe names FR, EN in metadata), §6 F4 F5 F6, §8 D6
6. `apps/web/src/modules/commerce/server/stripe-port.ts` (W2-04), `apps/web/src/modules/catalog/collections/courses.ts`, `apps/web/src/modules/commerce/collections/discount-codes.ts`

## Acceptance criteria
- [ ] `syncCourseToStripe(courseId)` (CONTRACT §4) reads `catalog.getCourseCommerceRecord`: Product upsert (create with idempotency key `course-<id>-product` when no `stripeProductId`), `name` = FR title, `description` = FR summary, `metadata` = `{ payloadCourseId, title_en, slug_fr, slug_en }`, `tax_code` = `STRIPE_TAX_CODE` when set. Price: if none, or `unit_amount`/currency differ → create Price (`cad`, `unit_amount = price`, `tax_behavior: 'exclusive'`), set Product `default_price`, archive the old Price (`active: false`). Unchanged course → zero Stripe writes. `status: 'archived'` → Product `active: false`. Result written via `catalog.recordCourseStripeSync` (`synced` or `error` + message). Returns `Result<{ productId, priceId }>`.
- [ ] Job tasks `stripe-sync-course` `{ courseId }` and `stripe-sync-discount` `{ discountCodeId }`, retries 3, added to `syncJobTasks` in `commerce/sync/index.ts` (composed into `commerceJobTasks` by W2-04's barrel).
- [ ] `courses` `afterChange` hook (exception: catalog file) enqueues `stripe-sync-course` when the published version changes price, title or status (publish, archive); skipped when `context.skipStripeSync`; draft-only saves do not enqueue; sets `stripeSyncStatus: 'pending'` via `recordCourseStripeSync` (no hook loop — test proves one job per publish). Enqueue uses `req` so it joins the save transaction.
- [ ] `discount-codes` `afterChange` hook → `stripe-sync-discount`: Coupon (`percent_off` or `amount_off` + `currency: 'cad'`, `duration: 'once'`, `max_redemptions`, `redeem_by` from `expiresAt`, `applies_to.products` from `appliesTo` courses' `stripeProductId`), Promotion Code with `code`. Value/kind/appliesTo change → new Coupon + new Promotion Code, old Promotion Code deactivated. `active: false` → Promotion Code deactivated. `stripeCouponId`/`stripePromotionCodeId` written back with `context.skipStripeSync`. `personalFor` codes are out of scope (W3 credits) → skipped with a note.
- [ ] Backfill script `apps/web/src/modules/commerce/sync/scripts/backfill.ts` (run: `pnpm payload run src/modules/commerce/sync/scripts/backfill.ts`), idempotent, syncs every published course and active discount code.
- [ ] Tests: unit (param mapping, change detection) + integration with fake Stripe via the W2-04 port: first sync, no-op resync, price change (new price + archive old), archive, error path writes `error`, hook enqueues exactly one job per publish, draft save enqueues none, discount create/update/deactivate.
- [ ] Migration `<timestamp>_w2_jobs_stripe_sync` (adds the two task slugs to the jobs enum), verified up/down/up on a throwaway branch, applied to Neon `dev` then `staging`; `payload-types.ts` regenerated.
- [ ] Live: backfill against Neon `dev` with the Stripe **test** key → each published seed course has `stripeSyncStatus: 'synced'` and a Stripe Product whose `metadata.payloadCourseId` matches (verify via Stripe API list). Record counts here. Run backfill on `staging` too (copy `apps/web/.env.staging` into the worktree read-only use; never edit the original) — 0 courses is a valid result.
- [ ] CI green; Vercel deploy Ready. Staging: after deploy, `vercel curl /api/cron/jobs` with bearer → 200.

## Implementation steps
1. Worktree + env copy; throwaway Neon branch from `dev`, migrate, seed.
2. `commerce/sync/{course.ts,discount.ts,jobs.ts,index.ts,scripts/backfill.ts}`.
3. Hooks in `catalog/collections/courses.ts` and `commerce/collections/discount-codes.ts` (enqueue by task slug string; catalog must not import commerce).
4. Migration + types; verify; apply dev → staging.
5. Tests, live backfill, push, CI, Vercel Ready.

## Files to create / edit
- Create/edit: `apps/web/src/modules/commerce/sync/**` (owns this sub-barrel), `apps/web/src/modules/commerce/__tests__/sync*.test.ts`.
- Edit (hooks only): `apps/web/src/modules/catalog/collections/courses.ts` (exception, catalog-owned; no other 2c task edits it), `apps/web/src/modules/commerce/collections/discount-codes.ts`.
- Create: `apps/web/src/migrations/<timestamp>_w2_jobs_stripe_sync.{ts,json}`; edit `apps/web/src/migrations/index.ts`, `apps/web/src/payload-types.ts`. **Batch 2c migration owner — no other 2c task migrates.**

## DO NOT TOUCH
- `commerce/index.ts`, `commerce/server/**`, `commerce/webhook/**`, `commerce/attendees/**`, any other collection field, `payload.config.ts`, `messages/*.json` (staff-only, no customer strings), `src/app/(payload)/admin/importMap.js` (no admin components here).

## Erick handoffs
- None for this task. D6 later: once GST/QST confirmed, set `STRIPE_TAX_CODE` + `STRIPE_TAX_ENABLED=true` in Vercel and re-run backfill.

## Done when
All criteria ticked, migration applied dev + staging (never production), backfill results recorded, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-08 -b w2-08 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
