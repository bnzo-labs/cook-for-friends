---
type: task
id: W3-09
status: pending
wave: 3
batch: 3a
module: commerce
agent: backend-engineer
model: opus
depends-on: []
migration-owner: false
---

# W3-09 — Commerce seat operations: per-seat cancellation money path, credit codes, customer reads

## Mission
Give scheduling and the portal the commerce primitives Wave 3 needs (CCR-W3-4): execute a **per-seat** cancellation (mark seat, revoke that attendee's entitlement, refund part of the order or issue a personal credit code), implement `issueCreditCode`, list a customer's seats and orders, set attendance, and let a buyer read the guest seats of their own orders. Money path → Opus.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan + W2-07/W2-08 entries) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.4, §3.7 (enrollments row), §4 commerce (CCR-W2-6 + CCR-W3-4), §6 `charge.refunded`
5. `docs/DISCOVERY.md` §7 R9, §8 D1 D9
6. `apps/web/src/modules/commerce/{webhook/refund.ts,webhook/handlers/charge-refunded.ts,sync/discount.ts,attendees/**,collections/{enrollments,orders,discount-codes}.ts,server/tx.ts}`; `tasks/W2-07-*.md`, `tasks/W2-08-*.md` completion notes

## Contract (CCR-W3-4 — authoritative text in CONTRACT 1.3 §4)
`executeSeatCancellation`, `issueCreditCode` (existing signature, now implemented), `getEnrollmentView`, `listCustomerEnrollments`, `listCustomerOrders`, `setEnrollmentAttendance`, types `EnrollmentView`, `OrderSummary`; `AttendeeRow.locale`. Policy (which outcome, how much) is **scheduling's** decision — commerce executes what it is told and never reads `cancellation-policy`.

## Decisions in force
- Q11 default: only the **buyer** (`order.customer`) or staff may cancel a seat — scheduling enforces; commerce trusts its caller but re-checks `amount ≤ seatAmount − already refunded for that enrollment`.
- Q12 default: refund → original card (Stripe refund on the order's PaymentIntent, `metadata.enrollmentId`); credit → personal code for the **buyer**: `discount-codes { kind: 'amount', value: amount, maxRedemptions: 1, personalFor: buyer, expiresAt: now + 365 d, active: true, code: 'CFF-CR-' + 8 Crockford chars }`, synced to Stripe by the existing `stripe-sync-discount` job. If the sync maps `personalFor` to a Stripe `customer` restriction only when the buyer has `stripeCustomerId`, fine; otherwise rely on code secrecy — document which.
- Ordering (no lost money, no double refund): **tx** (lock enrollment `FOR UPDATE` → must be `confirmed` else `CONFLICT` → set `status: 'cancelled'`, `cancelledAt`, `cancellationOutcome` → `access.revokeEntitlement({ customerId: attendee, courseId, source: 'purchase', sourceRef: orderId, tx })` → for credit: create the discount-code row in the same tx) → **commit** → refund: `refundOrder({ orderId, amount, enrollmentId, reason })` with Stripe idempotency key `seat-cancel-<enrollmentId>`. Stripe failure → `UPSTREAM`, error log; the seat stays cancelled with outcome `refund` and no `orders.refunds[].enrollment` link → **re-calling `executeSeatCancellation` for that enrollment retries the refund only** (idempotent, same key). `charge.refunded` later sets enrollment `refunded` (extend the W2-07 partial-refund branch: when `refunds[].enrollment` is set and that enrollment is `cancelled`, set it `refunded`; no other change).
- `amount = 0` or outcome `none` → no Stripe call, no code.
- Commerce does **not** call `scheduling.onSeatReleased` or send emails here — scheduling does both after this returns (keeps the email copy decision in one place).
- Enrollments access (CONTRACT §3.7): customer reads `customer = self` **or** `order.customer = self`.

## Acceptance criteria
- [ ] All CCR-W3-4 exports implemented with the exact signatures; `commerce/index.ts` re-exports (new sub-barrel `commerce/seats/**` owned by this task; `index.ts` gains one `export * from "./seats"` line).
- [ ] Integration (real Postgres): refund path on a 3-seat order cancels seat #2 only → enrollment #2 `cancelled`, guest #2 entitlement revoked, others untouched, Stripe refund requested with `amount` + `metadata.enrollmentId` + idempotency key (Stripe port test double at the network seam, same as W2-07); replaying `charge.refunded` for it → enrollment `refunded`, `orders.refunds[].enrollment` linked, order `partially_refunded`; cancel same seat twice concurrently (`Promise.all`) → exactly one success, one `CONFLICT`, one Stripe call; Stripe failure → `UPSTREAM`, seat cancelled, retry call refunds once; `amount > seatAmount` → `VALIDATION`.
- [ ] Credit path: code row created in the tx (rollback test: forced throw after insert → no code, seat still confirmed); code format; `personalFor` = buyer; expiry +365 d; `stripe-sync-discount` job enqueued.
- [ ] `listCustomerEnrollments(buyer)` returns own seat + guest seats flagged `bookedByMe`; `listCustomerEnrollments(guest)` returns only the guest's seat (`isOwnSeat`). `listCustomerOrders` returns paid/refunded/partially_refunded orders newest first with `hasReceipt`. `getEnrollmentView` includes `buyerCustomerId`, `sessionId`, `courseId`, `seatAmount`, `refundedAmount`.
- [ ] Access: customer REST read of a guest seat in **own** order → visible; of another order's seat → not visible (test).
- [ ] `setEnrollmentAttendance` staff-only callers (function takes `staffId`; route-level auth is scheduling's), `cancelled` seat → `CONFLICT`. `AttendeeRow.locale` populated from attendee `preferredLocale`; CSV unchanged (no new column).
- [ ] Unit + integration green in CI (not skipped); typecheck/lint green; Vercel preview Ready. Existing W2-07 replay/oversell tests still green.

## Files to create / edit
- Create: `apps/web/src/modules/commerce/seats/**` (+ `__tests__`), credit implementation in `seats/credit.ts`.
- Edit: `commerce/index.ts` (one re-export line + `issueCreditCode` export), `commerce/collections/enrollments.ts` (access.read only), `commerce/webhook/handlers/charge-refunded.ts` (partial-refund → enrollment `refunded`, minimal), `commerce/attendees/{list,types}.ts` (`locale` only), `commerce/types.ts`.
- Edit: `messages/{fr,en}.json` only under `commerce.*` if needed (likely none).

## DO NOT TOUCH
`commerce/collections/*` fields (no schema change — if one seems needed, CCR + stop), `catalog/**`, `scheduling/**`, `access/**` internals (call its index), `notifications/**`, `src/app/**`, migrations, `payload-types.ts`.

## Erick handoffs
- None. Stripe test mode via the port double; live Stripe test-mode smoke of one partial refund optional (`STRIPE_SECRET_KEY` test key in `.env.local`) — record the refund id if run.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-09 -b w3-09 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W309_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-09/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-09): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

