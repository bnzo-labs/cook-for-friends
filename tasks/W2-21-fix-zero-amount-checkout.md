---
type: task
id: W2-21
status: complete
wave: 2
module: commerce (webhook)
agent: backend-engineer
model: opus
depends-on: [W2-11]
---

# W2-21 — Fulfil zero-amount Checkout sessions (`payment_status = no_payment_required`)

## Mission
Fix W2-11 finding **H-1**. A 100 % promotion code (or an amount-off code ≥ the line total) produces a Checkout session that completes with `payment_status = "no_payment_required"` and no PaymentIntent. The webhook only fulfils `payment_status === "paid"`, so it records the event as `skipped`: no order, no enrollment, no entitlement, no email. The buyer sees the success page, the hold expires after 15 min, and the seat is sold again (venue oversell). Staff can create such codes today (`discount-codes.value` percent allows 1–100; `allow_promotion_codes: true` on every session).

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (W2-04, W2-07 entries)
3. This file + `tasks/W2-11-commerce-security-review.md` (finding H-1)
4. `docs/CONTRACT.md` §3.4 (`orders`), §4 (commerce), §6 (`checkout.session.completed`)
5. `apps/web/src/modules/commerce/webhook/handlers/completed-prepare.ts`, `completed-apply.ts`, `webhook/refund.ts`, `webhook/emails.ts`

## Evidence
- `apps/web/src/modules/commerce/webhook/handlers/completed-prepare.ts:165` — `if (session.payment_status !== "paid") return { kind: "unpaid" }`
- `apps/web/src/modules/commerce/webhook/handlers/completed-apply.ts:73` — oversell path throws when there is no PaymentIntent (a zero-amount order that loses the seat race would 500 forever).
- `apps/web/src/modules/commerce/collections/discount-codes.ts:18` — percent 1..100 allowed.
- `apps/web/src/modules/commerce/server/checkout.ts:69` — `allow_promotion_codes: true`.
- No reference to `no_payment_required` anywhere in `apps/`.

## Acceptance criteria
- [x] `prepareCompleted` treats `paid` **and** `no_payment_required` as fulfillable; `unpaid` stays `skipped` (async methods are off: `payment_method_types: ["card"]`).
- [x] Zero-amount fulfilment = the normal path: order `paid` with `total = 0`, `stripePaymentIntentId = null`, N enrollments (`seatAmount` 0 each, Σ = 0), N entitlements, `order-confirmation` + guest `enrollment-confirmation` emails, hold `converted`.
- [x] Zero-amount oversell (hold expired, < N seats left): no Stripe refund call; order status `cancelled` (no `refunds[]` row), hold `expired`, `oversell-refund` email with `refundAmount: 0`, outcome `refunded`. Never throws for a missing PaymentIntent when `amount_total === 0`. Non-zero total without a PaymentIntent still throws (unchanged).
- [x] `refundOrder` on a zero-total order → `CONFLICT ORDER_NOT_REFUNDABLE` (already true via `stripePaymentIntentId` check — add a test).
- [x] Integration tests (Neon branch, real DB) in `webhook.test.ts`: (a) 100 %-off single seat → 1 order total 0, 1 enrollment, 1 entitlement, 1 job; replayed twice → still 1 of each; (b) quantity 3 at total 0 → 3 enrollments, Σ seatAmount = 0, 1 + 2 jobs; (c) zero-amount oversell → 0 enrollments, 0 Stripe refund calls on the fake, order `cancelled`, oversell email queued.
- [x] Unit test: `prepareCompleted` returns `paid` kind for `no_payment_required`, `unpaid` for `unpaid`.
- [x] CI integration job runs the new tests (not skipped); link the run in the PR.

## Implementation steps
1. Worktree from `origin/main`, env copy, throwaway Neon branch from `dev` (never `production`; never boot dev-mode Payload against Neon `dev`).
2. Tests first (RED), then the two handler changes (GREEN).
3. PR `fix(W2-21): fulfil zero-amount checkout sessions`; do not merge.

## Files to create / edit
- Edit: `apps/web/src/modules/commerce/webhook/handlers/completed-prepare.ts`, `completed-apply.ts`, `apps/web/src/modules/commerce/__tests__/webhook.test.ts` (+ `webhook-unit.test.ts`), fakes in `__tests__/fake-stripe.ts` if needed.

## DO NOT TOUCH
- Other modules, `payload.config.ts`, migrations (no schema change needed), `docs/CONTRACT.md`.

## Erick handoffs
- Until merged: do not create 100 % (or ≥ price amount-off) discount codes in Payload/Stripe.

## Done when
All criteria ticked, CI green with integration job run, W2-11 updated (H-1 closed).

## Communication
Caveman. English only.

---

## Result (2026-11-08, backend-engineer, Opus)

Scope widened by the orchestrator to H-1 + M-1 + L-1 + L-2 (one PR). Paths relative to `apps/web/src/`.

- **H-1** `modules/commerce/webhook/handlers/completed-prepare.ts` — `FULFILLABLE_PAYMENT_STATUSES = {paid, no_payment_required}`; `unpaid` stays skipped. `completed-apply.ts` — `oversell()` branches to `oversellZeroAmount()` when `amount_total === 0`: no Stripe refund, order `cancelled` (no `refunds[]`), hold `expired`, `oversell-refund` email `refundAmount: 0`, outcome `refunded`. Non-zero total without PaymentIntent still throws.
- **M-1** `webhook/shared.ts` `isAppObject(metadata)` (= `cartToken` present). Foreign Checkout session → prepare kind `foreign` → `skipped`; foreign charge (`charge-refunded.ts`: charge metadata, else PaymentIntent metadata via `paymentIntents.retrieve`) → `skipped`; foreign invoice (`invoice-finalized.ts`: invoice metadata) → `skipped`. Ours-but-unmatched still throws (500, retry). Ours with malformed metadata still throws.
- **L-1** `lib/jobs-access.ts` → `isStaff(req.user)` (customers denied).
- **L-2** `modules/commerce/webhook/receipt.ts` → foreign order = NOT_FOUND (404), same as unknown id.

Tests: `webhook.test.ts` (+6), `webhook-events.test.ts` (+4), `webhook-receipt.test.ts` (403 → 404), new `webhook-prepare-unit.test.ts` (5), `lib/jobs-access.test.ts` (+2). RED verified against `main` before the fix.

Residual (not in scope): the `oversell-refund` template (notifications) shows a "refund" of 0 $ for a zero-amount order; copy tweak can ride on M-2/M-3.
