---
type: task
id: W2-07
status: pending
wave: 2
module: commerce (webhook)
agent: backend-engineer
model: opus
depends-on: [W2-03, W2-04, W2-05]
---

# W2-07 — Idempotent Stripe webhook: orders, enrollments, entitlements, auto-refund, receipts

## Mission
Implement `handleStripeEvent`, `refundOrder`, `POST /api/stripe/webhook` and `GET /api/orders/:id/receipt` exactly per CONTRACT §6. A paid Checkout becomes one order, one enrollment, one entitlement and one confirmation email with `.ics` — never two, under any re-delivery or concurrency. If the seat is gone (expired hold), refund automatically. Prove it with the R6 replay test and the oversell-refund test.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + W2-04 entry: metadata keys, tx helpers, stripe port)
3. This file
4. `docs/CONTRACT.md` §3.3, §3.4, §4 (`commerce`, `access`, `identity.upsertCustomerByEmail`, `notifications` + CCR-W2-3 in `tasks/W2-05-notifications.md`, `scheduling.onSeatReleased`, `catalog.getSessionView`), §5.1 webhook + receipt rows, §6 (whole section), §7
5. `docs/DISCOVERY.md` §6 F1 F2 F3 F5, §7 R5 R6 R12, §8 D6 D9
6. `docs/MASTER_BUILD_SPEC.md` §4 rules 1–3
7. `apps/web/src/modules/commerce/**` as left by W2-04 (`server/tx.ts`, `server/stripe-port.ts`, `server/availability.ts`)

## Decisions in force
- One line per order in Wave 2 (D9). Oversell → **full** refund of the order, no enrollment, no entitlement, outcome `refunded`, `oversell-refund` email.
- Order confirmation email does **not** include a magic link in Wave 2 (portal login page is W3-01; plan open question Q3). Use `site-settings.contactEmail` in the email.
- Card only, so `payment_status` is `paid` on `checkout.session.completed`; still handle async events per §6 defensively.
- Order `number` = `CFF-` + order id zero-padded to 6, set inside the same transaction (no migration, no sequence).

## Acceptance criteria
- [ ] Route `POST /api/stripe/webhook` (Node runtime): raw body via `req.text()`, `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Missing secret → 500 + error log (fail closed). Bad signature → 400. Duplicate → 200 `{ outcome: 'skipped' }`. Handler error → 500 (Stripe retries).
- [ ] Envelope (§6): customer upsert and any Stripe reads happen **before** the transaction; then one Payload transaction: `INSERT processed-stripe-events(eventId)` (unique violation → `skipped`, nothing else written) → handler → commit. Emails only via `notifications.enqueueEmail({ …, tx })`. After commit, best-effort `payload.jobs.run` for the queued email via `after()` from `next/server`; cron `/api/cron/jobs` is the fallback.
- [ ] `checkout.session.completed` (+ `async_payment_succeeded`): upsert customer by `customer_details.email` (locale from metadata); order `paid` (unique `stripeCheckoutSessionId`) with items from metadata (`courseId`, `sessionId`, quantity 1, description), `subtotal`/`discountTotal`/`total` from the session, `taxGst`/`taxQst` from `total_details.breakdown` when tax is on (else 0), `promotionCode`, `stripePaymentIntentId`, `paidAt`. In-person: lock session row `FOR UPDATE`; hold `active` and unexpired → `converted` + enrollment (`attendeeIndex: 0`, `confirmed`); otherwise if a seat is available (excluding this hold) → enrollment anyway + hold `converted`; otherwise oversell path. Entitlement: `access.grantEntitlement({ source: 'purchase', sourceRef: String(orderId), tx })` for the course (both formats) except on oversell. Enqueue `order-confirmation` (idempotencyKey `order-confirmation-<orderId>`, `.ics` per enrollment with `uid` `enrollment-<id>@cookforfriends`).
- [ ] Oversell path: `refundOrder` semantics with Stripe idempotency key `oversell-<orderId>`; order `refunded` with a `refunds[]` entry; `processed-stripe-events.outcome = 'refunded'`; `oversell-refund` email.
- [ ] `checkout.session.async_payment_failed`: release holds, order `cancelled` (create it if missing). `checkout.session.expired`: holds → `released`, then `scheduling.onSeatReleased(sessionId)` after commit.
- [ ] `charge.refunded`: find order by payment intent; append refunds deduped by `stripeRefundId`; fully refunded → `refunded`, `access.revokeEntitlement(... reason: 'refund')`, enrollments → `refunded`, `onSeatReleased` after commit, `refund-issued` email (`full: true`); partial → `partially_refunded`, email `full: false`, no access change. Already-`refunded` oversell orders: dedupe only, no second email.
- [ ] Receipts: `stripeInvoiceId` + `invoicePdfUrl` stored whether `invoice.finalized` arrives before or after `checkout.session.completed` (e.g. read `session.invoice` at completion; `invoice.finalized` with no matching order → 500 so Stripe retries). `GET /api/orders/:id/receipt`: owner customer (`identity.getCurrentCustomer`) or staff → 302 to `invoicePdfUrl`; none → 404; others → 403 (no existence leak to anonymous: 404).
- [ ] Unknown event types → recorded `skipped`, 200.
- [ ] `refundOrder({ orderId, amount?, reason })` exported per CONTRACT §4: creates the Stripe refund (idempotency key), state changes arrive via `charge.refunded`. `handleStripeEvent` exported per CONTRACT §4.
- [ ] **R6 replay test** (integration, real Postgres, signed payloads via `stripe.webhooks.generateTestHeaderString` and a test secret; fake Stripe through the W2-04 port): every handled event type delivered twice sequentially **and** twice concurrently (`Promise.all`) → exactly 1 order, 1 enrollment, 1 entitlement, 1 queued confirmation job, 1 `processed-stripe-events` row per event id.
- [ ] **Oversell test:** capacity-1 session; hold A expires; buyer B allocates + completes; A's `checkout.session.completed` arrives → A refunded (fake Stripe records one refund with key `oversell-<id>`), B keeps the seat, enrollments for the session = 1.
- [ ] Rollback test: handler throws after inserting the event row → no event row, no order, no job; redelivery then succeeds.
- [ ] Local live check with Stripe test mode is optional (Stripe CLI may be absent); if `stripe` CLI exists use `stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to localhost:3100/api/stripe/webhook`.
- [ ] Copy under `commerce.receipt.*` / `commerce.webhook.*` only. No new `errors.*` keys (reuse existing).
- [ ] CI green (integration job runs these tests); Vercel deploy Ready. Staging: `vercel curl -X POST /api/stripe/webhook` with a bogus signature → 400 (or 500 if `STRIPE_WEBHOOK_SECRET` not yet set on staging — record which; Erick handoff below).

## Implementation steps
1. Worktree + env copy; throwaway Neon branch from `dev`.
2. `commerce/webhook/{envelope.ts,handlers/*.ts,refund.ts,order-number.ts,index.ts}`; receipt helper.
3. Routes `app/api/stripe/webhook/route.ts`, `app/api/orders/[id]/receipt/route.ts`.
4. Tests: replay, concurrent replay, oversell, rollback, refund full/partial, invoice ordering, async failed, expired, receipt access.
5. Push, CI, Vercel Ready, staging probe.

## Files to create / edit
- Create/edit: `apps/web/src/modules/commerce/webhook/**` (owns this sub-barrel), `apps/web/src/modules/commerce/__tests__/webhook*.test.ts`, `apps/web/src/app/api/stripe/webhook/route.ts`, `apps/web/src/app/api/orders/[id]/receipt/route.ts`.
- Edit: `messages/{fr,en}.json` under `commerce.receipt.*` / `commerce.webhook.*` only.

## DO NOT TOUCH
- `commerce/index.ts`, `commerce/server/**` (W2-04's; if a helper must change → note it and add a minimal internal wrapper inside `webhook/`), `commerce/sync/**` (W2-08), `commerce/attendees/**` (W2-09), `commerce/collections/**`.
- `src/migrations/**`, `src/payload-types.ts` (W2-08 owns the 2c migration slot), `payload.config.ts`, other modules.

## Erick handoffs (needed for staging, not for this task's tests)
1. Stripe Dashboard (test mode) → Developers → Webhooks → add endpoint `https://cook-for-friends.vercel.app/api/stripe/webhook?x-vercel-protection-bypass=<Vercel automation bypass secret>`; API version `2026-08-26.dahlia`; events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `invoice.finalized`.
2. Copy its signing secret into Vercel env `STRIPE_WEBHOOK_SECRET` (Production + Preview), redeploy.

## Done when
All criteria ticked, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-07 -b w2-07 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
