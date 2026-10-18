---
type: task
id: W2-04
status: pending
wave: 2
module: commerce
agent: backend-engineer
model: opus
depends-on: [W2-01, W2-02, W2-03]
---

# W2-04 — Seat availability, holds, Stripe Checkout, hold expiry (commerce core)

## Mission
Make seat allocation correct under concurrency and create Stripe Checkout sessions: `getAvailableSeats`, `createCheckout`, `expireStaleHolds`, `releaseCartHolds`, `POST /api/checkout`, `POST /api/checkout/release`, and the `/api/cron/expire-holds` wiring. Lay down the commerce module structure (Stripe client, sub-barrels) that W2-07/08/09 build on. Prove no oversell with the R5 race test.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry: decisions, CCRs, batches)
3. This file
4. `docs/DISCOVERY.md` §2 (stripe 22.6.2, API `2026-08-26.dahlia`), §6 F1 F2 F3 F4 F5 F6, §7 R5 R10 R12, §8 D6 D9
5. `docs/CONTRACT.md` §1 (commerce row), §2, §3.4, §4 `@/modules/commerce` + `catalog` + `identity`, §5.1 checkout rows, §7
6. `docs/MASTER_BUILD_SPEC.md` §4 rule 3, §8 (security: rate limiting, Origin check, SameSite cookies)
7. `apps/web/src/modules/commerce/collections/*.ts`, `apps/web/src/modules/identity/server/http.ts` (Origin-check pattern), `apps/web/test/integration.ts`

## Decisions in force (do not relitigate)
- **D9:** 1 seat per purchase. Wave 2 `createCheckout` accepts **exactly one line**, `quantity === 1`, and `quantity <= siteSettings.maxSeatsPerPurchase` (VALIDATION otherwise). Keep `lines[]` / `quantity` in the API and data model.
- **F1/F2/F3:** hold = 15 min (`siteSettings.holdMinutes`) in DB; Checkout `expires_at` = now + 31 min (Stripe minimum is 30). Available = `capacity − confirmed enrollments − holds(status='active' AND expiresAt > now())`. Allocation: one transaction, `SELECT … FROM sessions WHERE id = $1 FOR UPDATE`, count, insert hold, commit. Raw SQL only inside commerce, on Payload's transaction (CONTRACT §4 `TxContext`).
- **D6:** `automatic_tax` only when `STRIPE_TAX_ENABLED=true`; otherwise omitted. `invoice_creation.enabled: true` always (receipts).
- Card only: `payment_method_types: ['card']` (async methods outlive a 15-min hold).
- `@payloadcms/plugin-stripe` rejected. `stripe@22.6.2` with `apiVersion: '2026-08-26.dahlia'` set explicitly.

## Contract Change Request (CCR-W2-4) — assumed approved at plan review
- New route `POST /api/checkout/release` (public, cart-token cookie, Origin check) → releases the cart's active holds and expires their open Checkout sessions → `200 { ok: true }`. Used by the storefront cancel page.
- New export `releaseCartHolds(cartToken: string): Promise<{ released: number }>`, and `commerceJobTasks` (scaffolded by W2-01).
- Commerce owned paths add `src/app/api/{sessions,orders}/**` (CONTRACT §5.1 already lists their routes under commerce).
- §7 clarification: commerce may read `sessions.capacity, status, course, starts_at` inside the locked raw-SQL `SELECT … FOR UPDATE` (F3). All other catalog data via `@/modules/catalog`.

## Acceptance criteria
- [ ] `src/lib/stripe.ts` exports a single Stripe client (`apiVersion: '2026-08-26.dahlia'`, `maxNetworkRetries: 2`). Commerce reaches Stripe only via `commerce/server/stripe-port.ts` (`getStripe()`, test-only `setStripeForTests()`); production code always uses the real client. The port is the only test seam (same pattern as identity's email sender).
- [ ] `commerce/index.ts` exports the CONTRACT §4 commerce functions owned here (`getAvailableSeats`, `createCheckout`, `expireStaleHolds`, `CartLine`) + `releaseCartHolds` + `commerceJobTasks`, and re-exports `./sync`, `./webhook`, `./attendees` sub-barrels, which this task creates **empty** (`export {}` plus `export const syncJobTasks: TaskConfig[] = []` in `sync/index.ts`; `commerceJobTasks = [...syncJobTasks]`). W2-07/08/09 own those folders. Do not implement their functions.
- [ ] `getAvailableSeats(sessionId, tx?)` matches F2 exactly. Test: an `active` hold whose `expiresAt` is 1 s in the past does not count (no cron involved).
- [ ] `createCheckout`: zod-validates input; per-IP rate limit via `identity.consumeRateLimit({ scope: 'ip', namespace: 'checkout', limit: 10, windowSeconds: 3600 })` (route level) → `429` with `messageKey: errors.CHECKOUT_RATE_LIMITED`; course via `catalog.getCourseCommerceRecord` must be published with a `stripePriceId` else `CONFLICT { reason: 'COURSE_NOT_PURCHASABLE' }`; in-person requires `sessionId` of that course, `status: 'scheduled'`, `startsAt > now`; online forbids `sessionId` and creates no hold.
- [ ] Re-checkout with the same `cartToken` first releases that cart's previous `active` holds (and expires their open Checkout sessions after commit) — a double-click never holds two seats.
- [ ] Hold insert happens in the locked transaction; Stripe Checkout is created **after** commit with idempotency key `hold-<holdId>`; on Stripe failure the hold becomes `released` and the result is `UPSTREAM`. `stripeCheckoutSessionId` is written back to the hold.
- [ ] Checkout params: `mode: 'payment'`, one line `{ price: stripePriceId, quantity: 1 }`, `expires_at` ≥ now + 30 min, `locale`, `customer_email` if given, `allow_promotion_codes: true`, `invoice_creation.enabled: true`, `payment_method_types: ['card']`, `automatic_tax` per D6, success/cancel URLs = `NEXT_PUBLIC_SITE_URL` + translated `/checkout/success?session_id={CHECKOUT_SESSION_ID}` / `/checkout/cancelled` for the locale (use next-intl `getPathname`), and `metadata` (+ `payment_intent_data.metadata`, `invoice_creation.invoice_data.metadata`) = `{ cartToken, holdId?, courseId, sessionId?, locale }`. W2-07 relies on these exact metadata keys.
- [ ] `POST /api/checkout`: CONTRACT §5.1 body; sets cookie `cff_cart` (32 random bytes base64url, HttpOnly, SameSite=Lax, Secure in production, 30 days, path `/`) if absent; Origin check (cross-site → 403); maps `ModuleError` → status + `errors.<code>` envelope (CONTRACT §2): SOLD_OUT 409, VALIDATION 400, CONFLICT 409, UPSTREAM 502. Response `{ ok: true, data: { checkoutUrl, holdExpiresAt } }`.
- [ ] `POST /api/checkout/release` per CCR-W2-4; no cookie → 200 `{ released: 0 }`.
- [ ] `expireStaleHolds(now?)`: `active` holds with `expiresAt <= now` → `expired`; for each with an open Checkout session → `checkout.sessions.expire` (already expired/complete → ignored, not an error). Idempotent. Returns `{ expired, checkoutSessionsExpired }`.
- [ ] `/api/cron/expire-holds` calls `expireStaleHolds()` and returns `200 { ok: true, expired, checkoutSessionsExpired }`; keeps the bearer check (401 without).
- [ ] **R5 race test** (integration, real Postgres): capacity-1 session, `Promise.all` of 2 and of 10 `createCheckout` calls with distinct cart tokens → exactly 1 `ok`, the rest `SOLD_OUT`, exactly 1 `active` hold row. Also passes with `TEST_DATABASE_URL` set to the branch's **pooled** (`-pooler`) URL (F3 PgBouncer check) — record both runs here.
- [ ] Other integration tests: capacity 3 with 1 confirmed enrollment + 1 live hold → 1 available; cancelled/past session rejected; release + re-checkout; `expireStaleHolds` (fake Stripe records `expire` calls); quantity 2 rejected; two lines rejected.
- [ ] Live smoke (local, Stripe **test** key from `.env.local`, throwaway branch): create a test-mode Product + Price via the API, record it with `catalog.recordCourseStripeSync`, call `createCheckout` → URL host `checkout.stripe.com`, retrieved session `expires_at - created >= 1800`, then expire it. Record session id (not secret) here.
- [ ] Missing `errors.*` keys added to `messages/{fr,en}.json` (`CHECKOUT_RATE_LIMITED`, `COURSE_NOT_PURCHASABLE`, …). **W2-04 is the only Wave 2 task that adds `errors.*` keys.** Other commerce copy under `commerce.checkout.*`.
- [ ] CI green (integration job runs these tests, not skipped); Vercel deploy Ready. Staging: `vercel curl /api/cron/expire-holds` with bearer → 200 JSON; `POST /api/checkout` with an invalid body → 400 envelope.

## Implementation steps
1. Worktree + env copy; throwaway Neon branch from `dev`, migrate, seed.
2. `lib/stripe.ts`, `commerce/server/stripe-port.ts`, `commerce/server/tx.ts` (begin/commit/rollback helpers on `payload.db`, raw SQL on the same transaction — see how W1-03 used `@payloadcms/db-postgres/drizzle`).
3. `server/availability.ts`, `server/holds.ts`, `server/checkout.ts`, `server/cart-token.ts`, `server/expire.ts`.
4. Sub-barrels `sync/`, `webhook/`, `attendees/` (empty), `index.ts`.
5. Routes `app/api/checkout/route.ts`, `app/api/checkout/release/route.ts`; wire `app/api/cron/expire-holds/route.ts`.
6. Tests (unit + integration + race), live smoke, push, CI, Vercel Ready, staging probes.

## Files to create / edit
- Create: `apps/web/src/lib/stripe.ts`, `apps/web/src/modules/commerce/server/*.ts`, `apps/web/src/modules/commerce/{sync,webhook,attendees}/index.ts` (empty barrels), `apps/web/src/modules/commerce/types.ts`, `apps/web/src/modules/commerce/__tests__/{availability,checkout,race,expire}.test.ts`, `apps/web/src/app/api/checkout/route.ts`, `apps/web/src/app/api/checkout/release/route.ts`.
- Edit: `apps/web/src/modules/commerce/index.ts`; `apps/web/src/app/api/cron/expire-holds/route.ts` (wiring only — exception, platform-owned, no other task edits it); `messages/{fr,en}.json` (`errors.*` new keys, `commerce.checkout.*`).

## DO NOT TOUCH
- `commerce/collections/**` (no schema change; if a field/index is missing → CCR + stop), `src/migrations/**`, `src/payload-types.ts`, `payload.config.ts`.
- Webhook, order creation, refunds, Stripe catalog sync, attendees (W2-07/08/09).
- Other modules. Storefront pages.

## Erick handoffs
- Confirm the Cloudflare cron worker is deployed (`infra/cron-worker/README.md` steps) — needed for automatic hold expiry on staging; not needed for this task's criteria.

## Done when
All criteria ticked, race test results (direct + pooled) recorded here, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-04 -b w2-04 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
