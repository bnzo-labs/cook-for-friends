---
type: task
id: W2-12
status: pending
wave: 2
module: quality
agent: e2e-runner
model: sonnet
depends-on: [W2-06, W2-07, W2-08, W2-09, W2-10]
---

# W2-12 — Wave 2 acceptance on staging: in-person purchase end to end

## Mission
Prove on the real staging deployment, with Stripe **test mode**, that a customer can buy **3 in-person seats (self + 2 guests)**, that buyer and guests each get their confirmation email with `.ics` and their own enrollment/entitlement/customer, that all three appear on the attendee list, and that the expired-hold oversell path refunds automatically. This is the "replaces Google Forms + e-transfer" gate (DISCOVERY §9, R14).

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan + every W2 entry)
3. This file
4. `docs/MASTER_BUILD_SPEC.md` §9 (DoD items 1, 2, 6, 7, 8), §11
5. `docs/CONTRACT.md` §5, §6
6. `docs/DISCOVERY.md` §6 F1 F2 F5, §7 R5, §8 D6 D8
7. `infra/cron-worker/README.md`

## Preconditions (check first; any missing → `status: blocked` naming the handoff, exit)
- Staging Stripe webhook endpoint exists and `STRIPE_WEBHOOK_SECRET` is set in Vercel (W2-07 handoff). Probe: `vercel curl -X POST /api/stripe/webhook` with a bogus signature returns **400** (500 = secret missing).
- Cloudflare cron worker deployed (README) — else run cron routes manually with `vercel curl` and mark criterion 5 "manual cron".
- `W2_TEST_EMAIL` present in `apps/web/.env.local` (W2-05 handoff).
- Vercel automation bypass secret available for Playwright: read it with `vercel api /v9/projects/cook-for-friends` (`protectionBypass`) — never print or commit it; pass via env to Playwright `extraHTTPHeaders: { 'x-vercel-protection-bypass': … }` set in the test file.

## Acceptance criteria
- [ ] Fixture script `apps/web/test/staging-fixtures.ts` (idempotent, run with a worktree copy of `apps/web/.env.staging`, never editing the original): creates `[TEST] Atelier W2` in-person course (published, price 1000 cents) with two future sessions (capacity **4** and capacity 1), asserts `site-settings.maxSeatsPerPurchase` = 4 on staging (W2-02b data step), and a temporary staff user with a random in-memory password (deleted at the end). Course reaches `stripeSyncStatus: 'synced'` with a `stripePriceId` within 10 minutes (jobs cron or manual `/api/cron/jobs`), and the Stripe test Product has `metadata.payloadCourseId` = course id.
- [ ] **Purchase 3 seats (FR):** Playwright `apps/web/e2e/w2-12-purchase.test.ts` against `https://cook-for-friends.vercel.app`: `/fr/cours/<slug>` → Réserver (capacity-4 session) → `/fr/panier` → quantity **3**, buyer email `W2_TEST_EMAIL`, guests `Invité Un` / `Invitée Deux` with plus-addressed variants of `W2_TEST_EMAIL` (`local+g1@…`, `local+g2@…`) → Payer → hosted Checkout shows quantity 3, card `4242 4242 4242 4242` → `/fr/commande/merci` returns **200** with the success heading.
- [ ] Within 5 minutes (staging DB queries via the fixture env): 1 order `paid` with `CFF-` number, item `quantity: 3`, `total` = 3 × 1000 (+ tax if on); **3 enrollments** `confirmed` (attendeeIndex 0,1,2; 3 distinct customers; guests' customers exist with the entered names; Σ `seatAmount` = order total); **3 entitlements** `source: purchase` (one per attendee); `processed-stripe-events` rows with outcome `applied`; hold `converted` (quantity 3); course page shows **1 seat left**; cart quantity picker for that session now maxes at 1.
- [ ] Email: `send-email` jobs completed: 1 `order-confirmation` to the buyer (lists both guests) + 2 `enrollment-confirmation` (one per guest), each job input with 1 `.ics`; Resend shows them sent/delivered (Resend API by message id). Resend's test domain may reject the plus-addressed guest recipients (D8): record the exact Resend error per message and mark only those deliveries blocked, continue.
- [ ] Attendee list: staff (temporary user) opens the session in `/admin` → Participants panel lists **3 rows** (buyer + 2 guests, guests badged, "booked by" = buyer) (**200** page, rows visible); `/api/sessions/<id>/attendees.csv` with the staff cookie → 200 `text/csv` containing all 3 emails and the `Booked by` column.
- [ ] Validation smoke (FR, no payment): quantity 2 with guest email = buyer email → inline error, no hold created (DB check).
- [ ] Hold expiry: create a hold via `POST /api/checkout` (capacity-1 session), do not pay; after ≥ 15 min and one `*/5` cron tick (or manual `/api/cron/expire-holds`), hold is `expired` and its Checkout session is `expired` in Stripe.
- [ ] **Oversell refund (R5 path):** on the capacity-1 session: browser A starts Checkout (hold A); fixture script forces hold A's `expiresAt` into the past; browser B books and pays; then A pays its still-open Checkout → A's payment is refunded automatically (Stripe refund exists, order `refunded`, outcome `refunded`), A receives `oversell-refund` email (same delivery caveat), B keeps the only enrollment.
- [ ] Receipt: the paid order has `invoicePdfUrl`; `/api/orders/<id>/receipt` without a cookie → 404/403, with staff cookie → 302 to the Stripe invoice. GST/QST on receipts: **deferred (D6)** while `STRIPE_TAX_ENABLED=false` — record "not testable" rather than fail.
- [ ] EN smoke: `/en/courses/<slug>` → Book → `/en/cart` renders (200) in English; no checkout needed.
- [ ] CI: the latest `main` CI integration job ran the R5 race and R6 replay tests (not skipped) — link the run.
- [ ] Cleanup: temporary staff user deleted; `[TEST]` course archived (Stripe Product inactive); test orders left for audit (they are test mode).
- [ ] Results table (criterion → evidence: ids, timestamps, run links) written in this file. No secrets in the file.

## Implementation steps
1. Worktree + env copies (`.env.local`, `.env.staging`, both `cp -p`, never edited).
2. Preconditions; fixtures; Playwright specs (`test.use({ extraHTTPHeaders })`, deterministic waits polling DB/HTTP, no fixed sleeps except the 15-min hold window).
3. Run, collect evidence, cleanup, write results, SESSION entry.

## Files to create / edit
- Create: `apps/web/test/staging-fixtures.ts`, `apps/web/e2e/w2-12-*.test.ts`.
- Edit: this file (results), `docs/SESSION.md`.

## DO NOT TOUCH
- `apps/web/src/**`, `infra/**`, `playwright.config.ts` (configure per-test), Neon `production`, Stripe live mode.
- If a product bug is found: write `tasks/W2-2N-fix-<slug>.md` (owner per CONTRACT §1), set this task `blocked`, exit.

## Erick handoffs (consolidated; all from earlier tasks)
1. Stripe test webhook endpoint + `STRIPE_WEBHOOK_SECRET` in Vercel (see W2-07).
2. Cloudflare cron worker deployed (README).
3. `W2_TEST_EMAIL` in `apps/web/.env.local`.

## Done when
Every criterion has evidence (or a named D6/D8 deferral), cleanup done, SESSION entry added, `status: complete` → Erick reviews Wave 2 gate.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-12 -b w2-12 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally. Never commit `apps/web/AGENTS.md` or `apps/web/CLAUDE.md` generated by `next dev`.
- **Never Neon `production`.** Staging DB writes only through the fixture script.
- Verify on the real target: final HTTP 200 + expected content. A 307 is not "loads". Staging is Vercel-auth protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`; Playwright uses the bypass header.
- After pushing: CI green **and** Vercel prod deploy `Ready` (`vercel ls`; failure reason via `vercel api /v13/deployments/<id>`).
- Rebase on `origin/main`, push to `main`. Small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.
