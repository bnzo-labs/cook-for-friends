---
type: task
id: W2-11
status: blocked
wave: 2
module: review (commerce, access, identity rate limit, notifications)
agent: security-reviewer
model: opus
depends-on: [W2-03, W2-04, W2-05, W2-07, W2-08, W2-09]
---

# W2-11 — Security + correctness review of Wave 2 money paths

## Mission
Independent Opus review of every Wave 2 path that touches money, seats, access or personal data, before Erick accepts Wave 2. Read-only on app code: findings go in this file; CRITICAL/HIGH findings become fix briefs.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan + every W2 entry)
3. This file
4. `docs/CONTRACT.md` §2–§7 (commerce, access, identity, notifications)
5. `docs/DISCOVERY.md` §6 F1–F3 F5, §7 R5 R6 R12 R13
6. `docs/MASTER_BUILD_SPEC.md` §4, §8
7. The diffs: `git log --oneline` for commits tagged `W2-03`, `W2-04`, `W2-05`, `W2-07`, `W2-08`, `W2-09`, then `git diff <before-W2-03>..origin/main -- apps/web/src`

## Acceptance criteria
- [x] Checklist reviewed and each item marked PASS / FINDING with file:line:
  - Webhook: signature on the raw body; fail closed without secret; event-id insert in the same transaction as side effects; no email or Stripe write that survives a rollback without an idempotency key; `after()` job run cannot double-send.
  - Seats: `FOR UPDATE` on the session row in the same transaction as the count and hold insert; availability formula = F2; no path creates an enrollment without the lock; oversell path refunds with an idempotency key.
  - Raw SQL: parameterized only; no string interpolation of input.
  - Checkout: input validation (zod), quantity/lines limits, rate limit, Origin check, `cff_cart` cookie flags, no open redirect in success/cancel URLs, metadata cannot be forged to grant another course (webhook trusts Stripe-side metadata it set, re-validates course/session ids exist).
  - Access: entitlements only via `access` functions; revocation on full refund; receipt and CSV routes enforce owner/staff; anonymous gets no existence leak.
  - Data: no PII or secrets in logs; CSV injection guard; email header injection impossible (`to` validated); `.ics` escaping.
  - **Multi-seat guest data (D9 change 2026-10-19, CCR-W2-6):** guest names/emails only on the hold row, enrollments (`attendeeName`) and customers — never in Stripe metadata, URLs, logs or analytics; hold `attendees` pruned 7 days after a non-active hold expires; guest names escaped in emails/admin/CSV and never in subject lines; `enrollment-confirmation` leaks no price/order/receipt/buyer email; guests cannot read the buyer's order or receipt (receipt route owner = order customer only).
  - **Email enumeration:** `/api/checkout` response (status, body, timing order of magnitude) is identical whether a guest email belongs to an existing customer or not; existing customer silently linked, name/locale not overwritten (`upsertCustomerByEmail`); no "already registered" path anywhere.
  - **Quantity integrity:** server re-derives N from the hold; webhook checks Stripe line quantity = metadata `quantity` = hold `quantity`; `quantity` bounded by settings (≤ 10 hard cap); `attendees.length === N − 1`; duplicate-email rules enforced server-side; hold allocation all-or-nothing under the lock; oversell refunds the whole order; Σ `seatAmount` = `order.total`.
  - **Abuse:** one paid order can make the system email up to 9 third-party addresses — confirm it only happens after a paid webhook (cost-gated) and checkout stays rate-limited; note residual risk.
  - Module boundaries: no deep imports across modules; only commerce writes commerce collections; catalog never imports commerce.
  - Tests: R5 race (incl. the multi-seat race: 2 buyers × quantity 2 for the last 3 seats → exactly one hold) and R6 replay (incl. quantity 3) tests exist, assert exact counts, and ran (not skipped) in the latest CI integration job — link the run.
- [x] Run the full suite on a throwaway Neon branch from `dev`; record pass count. Delete branch after.
- [x] Findings table: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, impact, fix suggestion.
- [x] For each CRITICAL/HIGH: write `tasks/W2-2N-fix-<slug>.md` (same frontmatter/sections as this brief, owner = module's agent per CONTRACT §1, `depends-on: [W2-11]`) and set this task `status: blocked` with "fixes required" until they close. No CRITICAL/HIGH → `status: complete`.

## Implementation steps
1. Worktree (read-only use) + env copy; throwaway Neon branch.
2. Walk the checklist; run tests; check the latest CI integration job log.
3. Write findings + fix briefs; SESSION entry.

## Files to create / edit
- Edit: this file (findings). Create: `tasks/W2-2N-fix-*.md` only if needed. Append to `docs/SESSION.md`.

## DO NOT TOUCH
- Any file under `apps/**` or `infra/**` (review only). `docs/CONTRACT.md`, `docs/DISCOVERY.md`.

## Erick handoffs
- None.

## Done when
Checklist complete, findings recorded, fix briefs written if needed, SESSION entry added, status set as above.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-11 -b w2-11 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after.
- **Never Neon `production`.**
- Rebase on `origin/main`, push docs to `main`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.

---

## Review results (2026-11-08, Opus, base `origin/main` 1f556fa)

**Status: blocked — fixes required (H-1 → `tasks/W2-21-fix-zero-amount-checkout.md`).** No CRITICAL. One HIGH (correctness on the seat/money path). Security posture of the Wave 2 money paths is otherwise good.

Paths below are relative to `apps/web/src/`.

### Checklist

| Item | Verdict | Evidence |
|------|---------|----------|
| Webhook signature on raw body | PASS | `app/api/stripe/webhook/route.ts:17` `request.text()` → `webhook/envelope.ts:124` `constructEvent` |
| Fail closed without secret | PASS | `envelope.ts:117-120` throws → route 500. Staging probe: bad signature → 500 (secret unset, by design) |
| Event-id insert in same tx as side effects | PASS | `envelope.ts:99-105` `claimEvent` (ON CONFLICT DO NOTHING) + handler + outcome in one `withTransaction` |
| No email / Stripe write surviving rollback without idempotency key | PASS | Emails = jobs queued with `tx.req` (`notifications/server/enqueue.ts:39`). Oversell refund key `oversell-<orderId>` (`completed-apply.ts:78`); key changes after a rollback, covered by `charge_already_refunded` recovery (`webhook/refund.ts:33-48`) |
| `after()` job run cannot double-send | PASS (note) | Payload 3.90 claims jobs with a non-locking UPDATE, so cron + `after()` can race, but every send carries a stable Resend `idempotencyKey` (`notifications/server/transport.ts:53`; keys `order-confirmation-<orderId>`, `enrollment-confirmation-<enrollmentId>`). Residual: Resend dedupe window 24 h |
| Seats: `FOR UPDATE` on session row with count + hold insert | PASS | `server/holds.ts:103-124` (cart advisory lock → session FOR UPDATE → release → count → insert); webhook `completed-apply.ts:21` |
| Availability = F2 | PASS | `server/availability.ts:16-28` (capacity − confirmed − Σ active unexpired hold quantity) |
| No enrollment without the lock | PASS | `createEnrollments` only after `placeSeats` (`completed-apply.ts:140-147`) |
| Oversell refunds with idempotency key | PASS | `completed-apply.ts:72-96` |
| Raw SQL parameterized | PASS | All `sql\`\`` templates with bound values (`holds.ts`, `availability.ts`, `expire.ts`, `webhook/orders.ts`, `envelope.ts`). No `sql.raw` / string concat of input |
| Checkout: zod, quantity/lines limits | PASS | `server/validation.ts:24-58` (1 line, qty 1..10, attendees ≤ 9, emails ≤ 254, names ≤ 100) + `checkLineRules` |
| Checkout: rate limit | PASS (note) | `app/api/checkout/route.ts:31` 10/IP/h, before body parse. IP from `x-forwarded-for[0]` (`identity/server/http.ts:34`) — safe on Vercel (overwritten at edge), spoofable elsewhere (L-6) |
| Checkout: Origin check | PASS | `isAllowedOrigin` on checkout + release. Staging probe: `Origin: https://evil.example` → 403 on both |
| `cff_cart` cookie flags | PASS | `server/http.ts:28-37` HttpOnly, SameSite=Lax, Secure in prod, Path=/, 30 d; 32 random bytes |
| No open redirect in success/cancel | PASS | `server/checkout.ts:33-40` built from `NEXT_PUBLIC_SITE_URL` + next-intl pathnames; no user input |
| Metadata cannot grant another course | PASS (note) | Metadata only set server-side (`checkout.ts:54-61`); webhook re-reads the hold and checks `hold.session_id === meta.sessionId` + quantities (`completed-prepare.ts:104-120`). Course existence not re-validated (L-4) |
| Access: entitlements only via `access` | PASS | `grantEntitlement` / `revokeEntitlement` only (`completed-apply.ts:123-129`, `charge-refunded.ts:38-46`) |
| Revocation on full refund | PASS | `charge-refunded.ts:100-113` revokes every attendee + enrollments `refunded` |
| Receipt / CSV enforce owner/staff; no anonymous existence leak | PASS (note) | `webhook/receipt.ts:23-33` anon → 404; `attendees/route.ts:17-23` anon 401 / customer 403. Staging probes: receipt anon → 404, CSV anon → 401. Logged-in customer gets 403 vs 404 (L-2) |
| No PII or secrets in logs | **FINDING** | M-2 (`notifications/server/send.ts:102` logs `to`); L-5 |
| CSV injection guard | PASS | `attendees/csv.ts:8-12` (`= + - @ \t \r` prefixed, RFC 4180 quoting) |
| Email header injection (`to` validated) | PASS | `notifications/jobs/send-email.ts:29` `z.string().email()`; Resend JSON API |
| `.ics` escaping | PASS | `notifications/server/ics.ts:48-57` + octet folding |
| Guest data only on hold/enrollments/customers | PASS | Not in Stripe metadata (`checkout.ts:52-61`), not in URLs/analytics; webhook logs only indexes (`completed-prepare.ts:147`). Exception: transport-failure log (M-2) |
| Hold `attendees` pruned 7 d after non-active expiry | PASS | `server/expire.ts:26-31` |
| Guest names escaped in emails/admin/CSV; never in subject | **FINDING** | Escaped everywhere (JSX, CSV guard, no `dangerouslySetInnerHTML`). Guest names not in subjects, but the **buyer's** free-text name is in the guest email subject (M-3) |
| `enrollment-confirmation` leaks no price/order/receipt/buyer email | PASS | `notifications/templates/enrollment-confirmation.tsx`; data built in `webhook/emails.ts:100-126` |
| Guests cannot read buyer's order/receipt | PASS (note) | Orders read = `customer` (buyer) only; receipt owner = `order.customer`. Guest can read own enrollment incl. `seatAmount` (L-3) |
| Email enumeration on `/api/checkout` | PASS | Checkout never reads `customers`; upsert happens only in the webhook. Same status/body/timing for known/unknown guest emails |
| Existing customer linked, not overwritten | PASS | `identity/server/magic-link.ts:50-73` |
| No "already registered" path | PASS | grep: none |
| Quantity integrity | PASS | Stripe line qty = metadata = hold (`completed-prepare.ts:169`, `:110`); attendees = N − 1 (`:115`); ≤ 10 hard cap (`validation.ts:7`); duplicate emails server-side (`validation.ts:124-129`); all-or-nothing (`holds.ts:113-114`); whole-order oversell refund; Σ seatAmount = total (`order-number.ts:15-21`) |
| Abuse: guest emails only after paid webhook; checkout rate-limited | PASS (residual) | Guest emails queued only in `applyCompleted` after payment. Residual: one paid order → up to 9 third-party emails with buyer-controlled name in subject (M-3) |
| Module boundaries | PASS (nit) | No deep imports except type-only `@/modules/_shared/types` (access, scheduling). Only commerce writes commerce collections; catalog never imports commerce |
| R5 / R6 tests exist, exact counts, ran in CI | PASS | `race.test.ts:57` (2 × qty 2 for last 3 → one hold), `webhook.test.ts:56,83,97` (replay incl. qty 3). Ran (not skipped) in CI run 42522416716, job "Integration (Neon branch)": `webhook.test.ts (10 tests)`, `race.test.ts (6 tests)`, 47 files passed / 1 skipped (live-smoke) — https://github.com/bnzo-labs/cook-for-friends/actions/runs/42522416716 |

### Local full suite (throwaway Neon branch from `dev`, migrated, NODE_ENV=test)
- `pnpm test`: **407 passed / 1 failed / 1 skipped (409)**, 46 files passed. The failure was a 5 s timeout in `identity/__tests__/schema.test.ts` ("staff read only themselves") caused by local-to-Neon latency; reran alone → 5/5 passed. Effective result: 408 passed, 1 skipped (live-smoke).
- Branch `w2-11-review-1794186902` deleted after the run.

### Findings

| ID | Severity | File:line | Impact | Fix suggestion | Status |
|----|----------|-----------|--------|----------------|--------|
| H-1 | HIGH | `modules/commerce/webhook/handlers/completed-prepare.ts:165`; `completed-apply.ts:73` | 100 %-off (or ≥ price amount-off) promo code → session completes with `payment_status = no_payment_required` → webhook `skipped`: no order, seat, entitlement or email. Buyer sees success page; hold expires; seat resold → venue oversell. Zero-amount oversell would also throw forever (no PaymentIntent). Staff can create such codes now (`discount-codes.ts:18`, `checkout.ts:69`) | Fulfil `no_payment_required` like `paid`; zero-amount oversell → no Stripe refund, order `cancelled`, email | Fixed in W2-21 |
| M-1 | MEDIUM | `webhook/shared.ts:65-71`; `handlers/charge-refunded.ts:88-92`; `handlers/invoice-finalized.ts:42-45` | Any Stripe event not created by this app (Dashboard/manual invoice, refund of a non-app charge, Payment Link) throws → 500 → Stripe retries for 3 days, alerts, and may disable the endpoint, halting real fulfilment | Distinguish "foreign" from "not yet committed": skip (200, outcome `skipped`, log) when the session/PI lacks our `cartToken` metadata; keep throwing only when our metadata exists but the order is missing | Fixed in W2-21 |
| M-2 | MEDIUM | `modules/notifications/server/send.ts:102` | Transport failure logs the recipient address (`to`) — guest/buyer email in Vercel logs; breaks D9 "never in logs" | Log `template` + idempotencyKey only, or a SHA-256 of `to` | Report (notifications) |
| M-3 | MEDIUM | `modules/notifications/templates/enrollment-confirmation.tsx:165`; `webhook/handlers/completed-prepare.ts:140` | Guest email subject contains the buyer's free-text name (Stripe `customer_details.name` or self-editable customer name, no length cap). A paying buyer can send up to 9 brand-domain emails to arbitrary addresses with attacker-chosen subject text (phishing/spam lure) | Drop `buyerName` from the subject (keep in body, JSX-escaped) or strip control chars and cap at ~60 chars | Report (notifications) |
| L-1 | LOW | `lib/jobs-access.ts:8` | `jobs.access.run = Boolean(req.user)`; customers are Payload users too (magic-link strategy), so any signed-in customer can call `/api/payload-jobs/run` (comment says staff only). No data exposure; lets customers trigger job runs | `isStaff(req.user)`; update `lib/jobs-access.test.ts` | Fixed in W2-21 |
| L-2 | LOW | `modules/commerce/webhook/receipt.ts:30` | Signed-in customer gets 403 for an existing foreign order vs 404 for unknown → order-id existence oracle (ids sequential anyway) | Return NOT_FOUND for foreign orders | Fixed in W2-21 |
| L-3 | LOW | `modules/commerce/collections/enrollments.ts:29,83` | Guest can read own enrollment via REST incl. `seatAmount` (price share) and `order` id (not the order itself) | Field `read` access on `seatAmount` = staff or `order.customer` | Report (commerce) |
| L-4 | LOW | `webhook/handlers/completed-apply.ts:31-41` | Course existence not re-validated (`course` may be null after a delete/unpublish); order creation then fails or carries a dangling id | Throw/log when `getCourseCommerceRecord` returns null for a paid session (or record order with description only) | Report (commerce) |
| L-5 | LOW | `server/checkout.ts:102`; `app/api/stripe/webhook/route.ts:30`; `app/api/checkout/route.ts:57` | Full error objects logged; Stripe errors can echo params (e.g. invalid `customer_email`) | Log `error.message` / Stripe `code` only | Report (commerce) |
| L-6 | LOW | `modules/identity/server/http.ts:34-37` | Rate-limit key trusts `x-forwarded-for[0]`; safe on Vercel only | Prefer `x-real-ip`/platform IP; document the Vercel dependency | Report (identity) |
| L-7 | LOW | `server/checkout.ts:54-61,71-72` | Cart token (cookie secret) copied into session, PaymentIntent and invoice metadata (visible to Stripe Dashboard users). Knowledge only allows releasing that cart's hold | Store a hash or the hold id only | Report (commerce) |
| L-8 | LOW | `modules/catalog/collections/courses.ts:51` (and `pages`) | Collections with drafts have no `readVersions` access → Payload default `Boolean(user)`: signed-in customers can read draft versions via `/api/courses/versions` (anonymous → 403, probed) | `readVersions: isStaffOrAdmin` | Report (catalog) |

### Staging probes (https://cook-for-friends.vercel.app, read-only, no checkout created)
receipt anon → 404; CSV anon → 401; webhook no signature → 400; bad signature → 500 (secret unset); checkout/release with foreign Origin → 403; `/api/payload-jobs/run` anon → 401; `/api/seat-holds` anon → 403; `/api/courses/versions` anon → 403.

### Next step
W2-21 (backend-engineer, Opus) fixes H-1. MEDIUM/LOW items for the orchestrator to schedule. When W2-21 merges, set this task `complete`.
