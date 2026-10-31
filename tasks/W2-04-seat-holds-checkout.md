---
type: task
id: W2-04
status: complete
wave: 2
module: commerce
agent: backend-engineer
model: opus
depends-on: [W2-01, W2-02, W2-02b, W2-03]
---

# W2-04 — Seat availability, holds, Stripe Checkout, hold expiry (commerce core)

## Mission
Make seat allocation correct under concurrency — for **1 to `maxSeatsPerPurchase` seats per purchase** (D9 change 2026-10-19) — and create Stripe Checkout sessions: `getAvailableSeats`, `createCheckout`, `expireStaleHolds`, `releaseCartHolds`, `POST /api/checkout`, `POST /api/checkout/release`, and the `/api/cron/expire-holds` wiring. Lay down the commerce module structure (Stripe client, sub-barrels) that W2-07/08/09 build on. Prove no oversell with the R5 race test.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry: decisions, CCRs, batches)
3. This file
4. `docs/DISCOVERY.md` §2 (stripe 22.6.2, API `2026-08-26.dahlia`), §6 F1 F2 F3 F4 F5 F6, §7 R5 R10 R12, §8 D6 D9
5. `docs/CONTRACT.md` **1.2** (CCR-W2-4 + CCR-W2-6 applied) §1 (commerce row), §2, §3.1 site-settings, §3.4, §4 `@/modules/commerce` + `catalog` + `identity`, §5.1 checkout rows, §7
6. `docs/MASTER_BUILD_SPEC.md` §4 rule 3, §8 (security: rate limiting, Origin check, SameSite cookies)
7. `apps/web/src/modules/commerce/collections/*.ts`, `apps/web/src/modules/identity/server/http.ts` (Origin-check pattern), `apps/web/test/integration.ts`

## Decisions in force (do not relitigate)
- **D9 (changed 2026-10-19, CCR-W2-6):** multi-seat. Still **exactly one line** per checkout (Q1). In-person `quantity` integer 1..`siteSettings.maxSeatsPerPurchase` (default 4, hard cap 10); online `quantity === 1`, no attendees. Buyer = attendee #0 always. `quantity > 1` ⇒ buyer `email` required (passed as Checkout `customer_email`, which Stripe locks) and `attendees.length === quantity − 1`, each `{ firstName 1..100, lastName 1..100, email }` trimmed, email lower-cased. Guest emails distinct from each other and from the buyer email (case-insensitive) → else VALIDATION with issue path `lines.0.attendees.<i>.email` and message `errors.ATTENDEE_EMAIL_DUPLICATE`. A guest email matching an existing customer is **accepted silently** (no different response — no enumeration). Schema fields come from W2-02b (`seat-holds.attendees`).
- **F1/F2/F3:** hold = 15 min (`siteSettings.holdMinutes`) in DB; Checkout `expires_at` = now + 31 min (Stripe minimum is 30). Available = `capacity − confirmed enrollments − Σ quantity of holds(status='active' AND expiresAt > now())`. Allocation: one transaction, `SELECT … FROM sessions WHERE id = $1 FOR UPDATE`, count, `available < N` → SOLD_OUT (all-or-nothing, never a partial hold), else insert **one** hold row with `quantity: N` + `attendees` + `customerEmail`, commit. Raw SQL only inside commerce, on Payload's transaction (CONTRACT §4 `TxContext`).
- **D6:** `automatic_tax` only when `STRIPE_TAX_ENABLED=true`; otherwise omitted. `invoice_creation.enabled: true` always (receipts).
- Card only: `payment_method_types: ['card']` (async methods outlive a 15-min hold).
- `@payloadcms/plugin-stripe` rejected. `stripe@22.6.2` with `apiVersion: '2026-08-26.dahlia'` set explicitly.

## Contract Change Request (CCR-W2-4) — assumed approved at plan review
- New route `POST /api/checkout/release` (public, cart-token cookie, Origin check) → releases the cart's active holds and expires their open Checkout sessions → `200 { ok: true }`. Used by the storefront cancel page.
- New export `releaseCartHolds(cartToken: string): Promise<{ released: number }>`, and `commerceJobTasks` (scaffolded by W2-01).
- Commerce owned paths add `src/app/api/{sessions,orders}/**` (CONTRACT §5.1 already lists their routes under commerce).
- §7 clarification: commerce may read `sessions.capacity, status, course, starts_at` inside the locked raw-SQL `SELECT … FOR UPDATE` (F3). All other catalog data via `@/modules/catalog`.

## Acceptance criteria
- [x] `src/lib/stripe.ts` exports a single Stripe client (`apiVersion: '2026-08-26.dahlia'`, `maxNetworkRetries: 2`). Commerce reaches Stripe only via `commerce/server/stripe-port.ts` (`getStripe()`, test-only `setStripeForTests()`); production code always uses the real client. The port is the only test seam (same pattern as identity's email sender). — `getStripeClient()` lazy singleton (`appInfo` set), `server/stripe-port.ts` (`getStripe`, `setStripeForTests` refuses outside tests, `expireCheckoutSessions`). Unit-tested.
- [x] `commerce/index.ts` exports the CONTRACT §4 commerce functions owned here (`getAvailableSeats`, `createCheckout`, `expireStaleHolds`, `CartLine`) + `releaseCartHolds` + `commerceJobTasks`, and re-exports `./sync`, `./webhook`, `./attendees` sub-barrels, which this task creates **empty** (`export {}` plus `export const syncJobTasks: TaskConfig[] = []` in `sync/index.ts`; `commerceJobTasks = [...syncJobTasks]`). W2-07/08/09 own those folders. Do not implement their functions. — `commerceJobTasks = [...syncJobTasks]`; `sync/`, `webhook/`, `attendees/` empty barrels re-exported. Plus route helpers (`CART_COOKIE`, `readCartToken`, `newCartToken`, `cartCookieHeader`, `moduleErrorResponse`) and types (`AttendeeInput`, `CartLine`, `CheckoutMetadata`, …).
- [ ] `getAvailableSeats(sessionId, tx?)` matches F2 exactly (holds counted by **Σ quantity**, not rows). Tests: an `active` hold whose `expiresAt` is 1 s in the past does not count (no cron involved); one live hold with quantity 3 on capacity 5 → 2. — integration tests written (`availability.test.ts`: 1 s past, qty 3 on cap 5 → 2, non-active ignored, confirmed+hold, tx read). **pending CI**.
- [ ] `createCheckout`: zod-validates input; per-IP rate limit via `identity.consumeRateLimit({ scope: 'ip', namespace: 'checkout', limit: 10, windowSeconds: 3600 })` (route level) → `429` with `messageKey: errors.CHECKOUT_RATE_LIMITED`; course via `catalog.getCourseCommerceRecord` must be published with a `stripePriceId` else `CONFLICT { reason: 'COURSE_NOT_PURCHASABLE' }`; in-person requires `sessionId` of that course, `status: 'scheduled'`, `startsAt > now`; online forbids `sessionId` and creates no hold. Multi-seat validation exactly as in Decisions D9 (quantity range from `getSiteSettings()`, email required when N > 1, attendee count, duplicate emails incl. buyer). Validation runs **before** the locked allocation (no lock taken for invalid input). — logic + pre-lock unit tests green (`checkout-unit.test.ts`: settings 2 → 3 rejected, draft/no price/unknown course, wrong/cancelled/past session, no allocation called); `validation.test.ts` 23 tests. Rate limit 429 route test **pending CI**.
- [ ] Re-checkout with the same `cartToken` first releases that cart's previous `active` holds (and expires their open Checkout sessions after commit) — a double-click never holds two seats. — cart advisory lock + release in the same locked tx; released Checkout sessions expired after commit; concurrent same-cart test in race suite. On SOLD_OUT the tx rolls back, so the cart's previous hold is kept (failed attempt changes nothing). **pending CI**.
- [ ] Hold insert happens in the locked transaction; Stripe Checkout is created **after** commit with idempotency key `hold-<holdId>`; on Stripe failure the hold becomes `released` and the result is `UPSTREAM`. `stripeCheckoutSessionId` is written back to the hold. — raw SQL insert in the READ COMMITTED tx (`withTransaction`), Stripe after commit, `hold-<id>` key, `released` + UPSTREAM on failure, write-back. **pending CI**.
- [x] Checkout params: `mode: 'payment'`, one line `{ price: stripePriceId, quantity: N }` (no `adjustable_quantity`), `expires_at` ≥ now + 30 min, `locale`, `customer_email` if given, `allow_promotion_codes: true`, `invoice_creation.enabled: true`, `payment_method_types: ['card']`, `automatic_tax` per D6, success/cancel URLs = `NEXT_PUBLIC_SITE_URL` + translated `/checkout/success?session_id={CHECKOUT_SESSION_ID}` / `/checkout/cancelled` for the locale (use next-intl `getPathname`), and `metadata` (+ `payment_intent_data.metadata`, `invoice_creation.invoice_data.metadata`) = `{ cartToken, holdId?, courseId, sessionId?, locale, quantity }`. Guest names/emails are **never** sent to Stripe — they live on the hold row only. W2-07 relies on these exact metadata keys. — `buildSessionParams` unit-tested (fr/en URLs via next-intl `getPathname`, metadata ×3, no guest PII, D6 toggle, ≥ 30 min). `locale` sent as `fr-CA` / `en` (Stripe has a Canadian-French locale).
- [ ] `POST /api/checkout`: CONTRACT §5.1 body; sets cookie `cff_cart` (32 random bytes base64url, HttpOnly, SameSite=Lax, Secure in production, 30 days, path `/`) if absent; Origin check (cross-site → 403); maps `ModuleError` → status + `errors.<code>` envelope (CONTRACT §2): SOLD_OUT 409 (with `details: { available }` from a fresh `getAvailableSeats`, informational), VALIDATION 400 (issues with field paths so the UI can mark the right guest field), CONFLICT 409, UPSTREAM 502. Response `{ ok: true, data: { checkoutUrl, holdExpiresAt } }`. — cookie flags + error mapping unit-tested; route integration tests (200 + cookie, reuse, 400 paths, 409 `details.available`, 409 COURSE_NOT_PURCHASABLE, 502, 403) **pending CI**. VALIDATION issues are in `error.details.issues` (CONTRACT §2) and mirrored in `error.issues` (same as identity routes).
- [ ] `POST /api/checkout/release` per CCR-W2-4; no cookie → 200 `{ released: 0 }`. — returns `{ ok: true, data: { released } }`. **pending CI**.
- [ ] `expireStaleHolds(now?)`: `active` holds with `expiresAt <= now` → `expired`; for each with an open Checkout session → `checkout.sessions.expire` (already expired/complete → ignored, not an error). PII retention: empties `attendees` on non-active holds with `expiresAt < now − 7 days` (Stripe retries webhooks up to 3 days; W2-07 reads attendees from the hold even if it expired). Idempotent. Returns `{ expired, checkoutSessionsExpired }`. — single UPDATE … RETURNING (concurrent runs split rows), closed sessions ignored, `DELETE … USING` prune. **pending CI**.
- [ ] `/api/cron/expire-holds` calls `expireStaleHolds()` and returns `200 { ok: true, expired, checkoutSessionsExpired }`; keeps the bearer check (401 without). — 500 JSON on failure. Route test (401/200) **pending CI**.
- [ ] **R5 race test** (integration, real Postgres): capacity-1 session, `Promise.all` of 2 and of 10 `createCheckout` calls with distinct cart tokens → exactly 1 `ok`, the rest `SOLD_OUT`, exactly 1 `active` hold row. **Multi-seat race:** session with 3 seats left, two buyers `quantity: 2` concurrently → exactly one `ok` (one hold, quantity 2), the other `SOLD_OUT`, available = 1 after; 10 concurrent `quantity: 1` for the last 3 seats → exactly 3 holds; `quantity: 4` with 3 left → `SOLD_OUT`, no hold. Also passes with `TEST_DATABASE_URL` set to the branch's **pooled** (`-pooler`) URL (F3 PgBouncer check) — record both runs here. — written in `race.test.ts` (2 + 10 on cap 1, 2×qty 2 with 3 left, 10×qty 1 for 3, qty 4 with 3 left, same-cart double click). **pending CI (direct URL)**; **pooled-URL run pending Erick** (agent denied creating a Neon branch / fetching its connection string). Results: direct — _CI_; pooled — _Erick_.
- [ ] Other integration tests: capacity 3 with 1 confirmed enrollment + 1 live hold → 1 available; cancelled/past session rejected; release + re-checkout (a quantity-3 hold released frees 3); `expireStaleHolds` (fake Stripe records `expire` calls) + 7-day attendee prune; two lines rejected; quantity 0, > max (settings set to 2 in test → 3 rejected), > 10, non-integer rejected; online quantity 2 rejected; N > 1 without email rejected; attendee count ≠ N − 1 rejected; guest email = buyer email (case/whitespace variants) rejected; duplicate guest emails rejected; guest email of an existing customer → `ok` with identical response shape; hold row stores `quantity` N, `customerEmail`, `attendees` in order; Stripe fake receives line `quantity: N` and metadata `quantity`. — all written (`checkout.test.ts`, `expire.test.ts`, `availability.test.ts`); "> max with settings 2" lives in `checkout-unit.test.ts` (catalog stubbed) so the shared site-settings global is never mutated under parallel suites. **pending CI**.
- [ ] Live smoke (local, Stripe **test** key from `.env.local`, throwaway branch): create a test-mode Product + Price via the API, record it with `catalog.recordCourseStripeSync`, call `createCheckout` → URL host `checkout.stripe.com`, retrieved session `expires_at - created >= 1800`, then expire it. Record session id (not secret) here. — partial: Stripe half run 2026-10-31 with the test key (`live-smoke.test.ts`, opt-in `STRIPE_LIVE_SMOKE=1`): test Product + Price created, real `buildSessionParams` → host `checkout.stripe.com`, `expires_at − created = 1860 s`, then expired, product archived. Session `cs_test_b1JrSr3i4ZBMi1ZtClgwi9YWYKTh2vXo0Zz6ngeCm5mnQ0CEt7XrSfjUGw`. DB half (`recordCourseStripeSync` + `createCheckout`) **pending** (no throwaway branch; covered by integration suites with the fake port).
- [x] Missing `errors.*` keys added to `messages/{fr,en}.json` (`CHECKOUT_RATE_LIMITED`, `COURSE_NOT_PURCHASABLE`, `ATTENDEE_EMAIL_DUPLICATE`, `BUYER_EMAIL_REQUIRED`, `QUANTITY_OUT_OF_RANGE`, `ATTENDEES_MISMATCH`, …). **W2-04 is the only Wave 2 task that adds `errors.*` keys.** Other commerce copy under `commerce.checkout.*`. — 12 keys FR/EN: CHECKOUT_RATE_LIMITED, COURSE_NOT_PURCHASABLE, SESSION_NOT_BOOKABLE, SESSION_INVALID, SESSION_REQUIRED, SESSION_NOT_ALLOWED, CART_SINGLE_LINE, CART_TOKEN_INVALID, QUANTITY_OUT_OF_RANGE, BUYER_EMAIL_REQUIRED, ATTENDEES_MISMATCH, ATTENDEE_EMAIL_DUPLICATE. No `commerce.checkout.*` copy needed yet.
- [ ] CI green (integration job runs these tests, not skipped); Vercel deploy Ready. Staging: `vercel curl /api/cron/expire-holds` with bearer → 200 JSON; `POST /api/checkout` with an invalid body → 400 envelope. — **pending** (agent told not to push; orchestrator pushes/merges, then CI + Vercel + staging probes).

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
- `commerce/collections/**` (multi-seat fields already added by W2-02b; any other missing field/index → CCR + stop), `src/migrations/**`, `src/payload-types.ts`, `payload.config.ts`.
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

## Result (2026-10-31, backend-engineer · Opus)
- Branch `w2-04-batch2b` (worktree), not pushed. No migration, no `payload-types.ts` regen, no collection change.
- Local: typecheck clean, lint 0 errors (1 pre-existing warning in `payload-types.ts`), `pnpm test` 134 passed / 139 skipped (integration, no `TEST_DATABASE_URL`). New: 52 unit tests (validation 23, checkout-unit 11, checkout-params 6, http 6, stripe-port 6) + 41 integration (checkout 25, availability 7, race 6, expire 3) + 1 opt-in live smoke.
- Design notes: allocation = one READ COMMITTED tx: `pg_advisory_xact_lock(cart)` → `sessions … FOR UPDATE` (+ re-check scheduled / course / future) → release cart's active holds → F2 count → insert one hold (raw SQL, attendees rows `_order` 1..N−1) → commit. Lock order session → hold rows matches W2-07's webhook. Advisory xact locks are transaction-scoped (PgBouncer transaction mode OK). Pre-lock validation uses `catalog.getCourseCommerceRecord`, `getSiteSettings`, `getSessionView` (no lock for invalid input).
- Pending: CI integration job (all integration criteria), pooled-URL R5 run (Erick), CI green + Vercel Ready + staging probes (after push).
