# SESSION LOG — Cook for Friends Platform

Newest first. Each entry: what was done, what is blocked, next step.

**Current wave:** 2 — Commerce core (plan approved 2026-10-19, revised for D9 multi-seat; batch 2a running) · **Gate:** Wave 0 approved 2026-10-11; Wave 1 complete 2026-10-18

---

## 2026-10-31 — W2-03 access/identity/scheduling seams — COMPLETE (backend-engineer)
All 10 acceptance criteria satisfied. Code written: `_shared/types.ts` (TxContext); `access/{index,types,server/entitlements,server/payload}.ts`; `identity/server/rate-limit.ts` (generic core + `consumeRateLimitGeneric`), `identity/index.ts` (re-exports `consumeRateLimit` CCR-W2-2); `scheduling/{index,server/seat-released,server/payload}.ts`. Tests: 3 unit (isActiveAt boundaries), 8 access integration tests (grant/list/active, idempotency seq+concurrent×5, multi-seat D9 per-attendee×3, revoke idempotent+NOT_FOUND, tx rollback+commit), 4 identity generic rate-limit integration tests (limit+1 denied, namespaces isolated, 10-concurrent→exactly-5-allowed, normalize+validate), 3 scheduling integration tests (no-waiting→silent, waiting→warn log, unknown-id→no-throw). Unit tests: 80 passed (87 skipped — integration, require TEST_DATABASE_URL). Typecheck: 0 errors. Lint: clean. No migration, no collection changes, no payload-types.ts changes. Note: integration tests require Neon throwaway branch (TEST_DATABASE_URL); CI creates branch automatically via GitHub Actions. Branch: w2-03-seams. Batch 2a unblocked: W2-04 + W2-05 can start once W2-02b lands.

## 2026-10-19 — W2-02 catalog-read-api — COMPLETE (backend-engineer)
Catalog public read API + CCR-W2-1 functions in `@/modules/catalog` (types.ts, server/{courses,sessions,settings,stripe-sync-record,mappers,where}.ts). 15 unit + 20 integration tests. No migration/collection/type changes. Finding F1: Postgres enum `enum_courses_status` lacks `archived` (see task file) -> needs database-specialist. Next: W2-04/W2-06 consume the API; compose `getSessionView` + `commerce.getAvailableSeats`.

---

## 2026-10-19 — Wave 2 plan approved + D9 changed to multi-seat; plan revised, CONTRACT 1.2 (architect, Opus)
- **Erick (client-confirmed):** plan approved; CCR-W2-1..5 approved; Q2–Q5 defaults accepted; Q1 kept (single-line cart) with quantity 1..max. **D9 changed:** up to 4 seats per purchase (site-settings, staff-editable), guest name + email per extra seat, guest light accounts, per-seat cancellation in Wave 3. Supersedes 2026-10-18 "1 seat".
- **CONTRACT 1.1 → 1.2:** CCR-W2-1..5 applied as written; new **CCR-W2-6** (multi-seat, approved 2026-10-19). DISCOVERY D9/R10/F2 + MASTER D9 updated.
- **New task W2-02b** multi-seat schema (backend-engineer · Sonnet, schema reviewed by Opus): settings default 4 / max 10, `seat-holds.attendees[]`, `enrollments.seatAmount`, `orders.refunds[].enrollment`, `getSiteSettings` fallback 4, seed. Owns migration slot **2a+** (single migration `w2_multi_seat`). Starts when W2-01 + W2-02 are on `main`; runs in parallel with W2-03.
- **Briefs revised:** W2-03 (per-attendee entitlement test), W2-04 (qty N holds, validation, multi-seat race), W2-05 (`enrollment-confirmation` guest template, qty/attendees in emails, migration after W2-02b), W2-06 (max seats note), W2-07 (guest upsert, N enrollments/entitlements, whole-order oversell refund, replay qty 3), W2-09 (row per seat, booked-by), W2-10 (quantity picker + guest fields), W2-11 (guest PII, enumeration, quantity integrity), W2-12 (buy 3 seats). W2-01/W2-02 untouched (running).
- Plan entry below updated in place (table, batches, critical path, CCRs, D9, edge-case defaults, open questions).
- **Next:** finish 2a (W2-01, W2-02, W2-03) → W2-02b → batch 2b.

## 2026-10-19 — W2-01 platform-prep COMPLETE (devops-agent)
Jobs queue wired (`jobs.tasks` from module `*JobTasks`, empty; run access staff-only), `/api/cron/jobs` runs `payload.jobs.run({limit:50})` (ran:0 when disabled), next-intl `pathnames` FR/EN for CONTRACT 5.2, `@react-email/components@1.0.12`. No migration (jobs disabled until W2-05 adds a task, that migration is W2-05's). CI green, Vercel prod Ready, staging probes pass (/fr 200, jobs 401/200). Commits 7aa130c, d876670. Details: `tasks/W2-01-platform-prep.md`.

## 2026-10-18 — Wave 2 plan (Commerce core) — APPROVED 2026-10-19, REVISED for D9 multi-seat (architect, Opus)
Approved by Erick 2026-10-19 with CCR-W2-1..6. Briefs: `tasks/W2-01` … `tasks/W2-12` + `tasks/W2-02b`.
## 2026-10-18 — Wave 2 plan (Commerce core) — AWAITING ERICK REVIEW (architect, Opus)
Planning only. No build agent starts before Erick approves this plan and the CCRs below. Briefs: `tasks/W2-01` … `tasks/W2-12`.

**Tasks**
| ID | Task | Agent · model | Depends on | Batch |
|----|------|---------------|------------|-------|
| W2-01 | platform-prep: jobs queue wiring (empty module task arrays), `/api/cron/jobs`, next-intl `pathnames`, `@react-email/components@1.0.12` | devops-agent · Sonnet | — | 2a |
| W2-02 | catalog-read-api: CONTRACT catalog functions + CCR-W2-1 | backend-engineer · Sonnet | — | 2a |
| W2-02b | multi-seat schema (D9 change, CCR-W2-6): settings default 4/max 10, hold `attendees[]`, enrollment `seatAmount`, refund→enrollment link, `getSiteSettings` fallback 4; **2a+ migration owner** | backend-engineer · Sonnet (Opus schema review) | W2-01, W2-02 | 2a+ |
| W2-03 | access entitlements, `identity.consumeRateLimit` (CCR-W2-2), `scheduling.onSeatReleased` seam, `_shared.TxContext` | backend-engineer · Sonnet | — | 2a |
| W2-04 | seat-holds-checkout: availability (Σ hold qty), N-seat holds + guest validation, `createCheckout`, `expireStaleHolds` (+ attendee PII prune), `/api/checkout(+/release)`, cron wiring, commerce skeleton, **R5 race test incl. multi-seat race** | backend-engineer · **Opus** | W2-01, W2-02, W2-02b, W2-03 | 2b |
| W2-05 | notifications: React Email FR/EN (+ guest `enrollment-confirmation`), `.ics`, `enqueueEmail`, `send-email` job (CCR-W2-3/6); **2b migration owner** (generated after W2-02b's) | backend-engineer · Sonnet | W2-01, W2-02b, W2-03 | 2b |
| W2-06 | storefront-content: home/pages blocks, course list/detail (read-only sessions, "up to N seats"), products | frontend-architect · Sonnet | W2-01, W2-02, W2-02b | 2b |
| W2-07 | stripe-webhook-orders: idempotent envelope, orders, guest customers, N enrollments + per-attendee entitlements, whole-order auto-refund, receipts, **R6 replay test (qty 1 + 3)** | backend-engineer · **Opus** | W2-03, W2-04, W2-05 | 2c |
| W2-08 | stripe-catalog-sync: courses + discount codes → Stripe, jobs, backfill; **2c migration owner** | backend-engineer · Sonnet | W2-02, W2-04, W2-05 | 2c |
| W2-09 | admin-attendees: `listAttendees` (row per seat, booked-by), CSV (Excel FR), session admin panel | backend-engineer · Sonnet | W2-04 | 2c |
| W2-10 | storefront-booking: availability, cart with quantity picker + guest name/email fields, Checkout redirect, success/cancel | frontend-architect · Sonnet | W2-04, W2-06 | 2c |
| W2-11 | security + correctness review of money paths | security-reviewer · **Opus** | W2-03, W2-04, W2-05, W2-07, W2-08, W2-09 | 2d |
| W2-12 | acceptance on staging (Stripe test): buy 3 seats → 3 enrollments/entitlements/emails+.ics, attendee list, hold expiry, oversell refund | e2e-runner · Sonnet | W2-06, W2-07, W2-08, W2-09, W2-10 | 2d |

**Parallel batches** (each batch starts when its deps are merged on `main`)
- 2a: W2-01 ∥ W2-02 ∥ W2-03 — no migrations.
- 2a+: W2-02b (after W2-01 + W2-02 merged; parallel with W2-03, disjoint paths) — only W2-02b migrates (`w2_multi_seat`).
- 2b: W2-04 ∥ W2-05 ∥ W2-06 (all need W2-02b) — only W2-05 migrates (jobs table), generated on top of W2-02b's migration.
- 2c: W2-07 ∥ W2-08 ∥ W2-09 ∥ W2-10 — only W2-08 migrates (sync task slugs).
- 2d: W2-11 ∥ W2-12. CRITICAL/HIGH findings or acceptance bugs → `tasks/W2-2N-fix-*.md`, then re-run the affected criteria.

**Critical path:** W2-02 → W2-02b → W2-04 (Opus) → W2-07 (Opus) → W2-12 (W2-03 in parallel with W2-02b). W2-05 must also land before W2-07; W2-08 before W2-12 (Stripe Price needed for real checkout).

**Ownership rules for this wave (no two parallel tasks write the same path)**
- Commerce is split by sub-barrel: W2-04 owns `commerce/index.ts`, `commerce/server/**`, `src/lib/stripe.ts` and creates empty `commerce/{sync,webhook,attendees}/index.ts`; W2-08 owns `sync/**`, W2-07 `webhook/**`, W2-09 `attendees/**`.
- Adding a Payload job task slug changes a Postgres enum = migration. One migration owner per batch (2a+ W2-02b, 2b W2-05, 2c W2-08); they also regenerate `payload-types.ts`. Nobody else migrates or regenerates types in Wave 2. The multi-seat schema got its own slot (W2-02b) rather than W2-05 (notifications agent must not own commerce schema) or W2-04 (would need W2-05's jobs migration moved); snapshots chain W2-02b → W2-05 → W2-08.
- `errors.*` message keys: W2-04 only. Others: own namespace (`storefront.*`, `storefront.booking.*`, `notifications.*`, `commerce.checkout.*`, `commerce.webhook.*`, `commerce.receipt.*`).
- Approved one-off exceptions (single writer each): W2-01 → one-line `*JobTasks` scaffolds in commerce/notifications `index.ts`, `nav-items.ts` if types require; W2-02b → `catalog/globals/site-settings.ts`, W2-02's settings fallback + test, `commerce/collections/{seat-holds,enrollments,orders}.ts`, `seed/index.ts` (value only); W2-03 → `_shared/types.ts` (TxContext); W2-04 → `api/cron/expire-holds/route.ts`; W2-05 → `identity/server/ports.ts`; W2-06 → delete `[locale]/page.tsx`; W2-08 → `catalog/collections/courses.ts` hook; W2-09 → `catalog/collections/sessions.ts` ui field + `importMap.js`.

**Contract Change Requests — all APPROVED 2026-10-19, applied in CONTRACT 1.2**
- CCR-W2-1 (catalog, W2-02): add `getCourseCommerceRecord`, `getSessionView`, `recordCourseStripeSync`; **replace** `getSessionWithAvailability` (storefront composes `getSessionView` + `commerce.getAvailableSeats`) to remove a catalog ↔ commerce import cycle.
- CCR-W2-2 (identity, W2-03): add `consumeRateLimit({ scope, namespace, key, limit, windowSeconds })` on the existing `auth-rate-limits` table (no schema change). Checkout uses 10/IP/h.
- CCR-W2-3 (notifications, W2-05): add `enqueueEmail` (in-transaction job), `notificationsJobTasks`, `IcsInput`, `Attachment`, and `EmailData` for `magic-link`, `order-confirmation`, `oversell-refund`, `refund-issued`.
- CCR-W2-4 (commerce, W2-04/W2-09): (1) route `POST /api/checkout/release` + export `releaseCartHolds`; (2) export `commerceJobTasks`; (3) commerce owns `src/app/api/{sessions,orders}/**` (routes already in §5.1); (4) §7 clarification: commerce reads `sessions` capacity/status/course/starts_at inside the locked raw-SQL SELECT (F3); (5) commerce reads `customers` name/email/phone/dietaryNotes read-only for attendee rows/CSV.
- CCR-W2-5 (platform, W2-01): modules export `<module>JobTasks: TaskConfig[]`; `payload.config.ts` composes `jobs.tasks` like collections.
- CCR-W2-6 (commerce + catalog + notifications, D9 multi-seat; W2-02b/04/05/07/09/10): `site-settings.maxSeatsPerPurchase` default 4 (max 10); `seat-holds.attendees[]` (guests; pruned 7 d after non-active expiry); `enrollments.seatAmount` (floor(total/N), remainder on #0); `orders.refunds[].enrollment`; `CartLine.attendees`, `AttendeeInput`, `AttendeeRow` (`attendeeIndex`, `isBuyer`, `bookedBy`); checkout validation; `refundOrder({ enrollmentId? })`; `EmailData['enrollment-confirmation']` + `quantity`/`attendees`; webhook upserts guest customers, N enrollments, per-attendee entitlements, whole-order oversell refund; availability = Σ hold quantity. No change to `_shared` types; SOLD_OUT carries `details.available` at the route.

**Decisions baked into briefs** — D9 (changed 2026-10-19): exactly one line per Checkout, in-person quantity 1..`maxSeatsPerPurchase` (default 4), online 1; guests by first/last name + email. D11: Cloudflare cron worker; `vercel.json` untouched. D6: `automatic_tax` only if `STRIPE_TAX_ENABLED=true`; `invoice_creation` always; GST/QST receipt check deferred. F1–F3: 15-min hold, Checkout `expires_at` now+31 min, availability from live holds, `FOR UPDATE`, cron expires sessions, webhook re-checks + auto-refunds. Stripe 22.6.2 / `2026-08-26.dahlia`, no plugin-stripe. Tests swap Stripe and Resend only at the network port (same pattern as identity's email sender); production paths always real.

**Multi-seat edge-case defaults (D9, documented; change = new CCR)**
- Buyer is always attendee #0 (no "buy for others only"). Buyer email required when N > 1 (Checkout `customer_email`, locked by Stripe).
- Guest email = buyer email, or duplicated within the order (case-insensitive, trimmed) → rejected at checkout (VALIDATION, field path). Webhook defensive fallback: link seat to the already-resolved customer, warn log, no extra email.
- Guest email matches an existing customer → linked to that customer; name/locale never overwritten (`upsertCustomerByEmail` existing behaviour); no response difference (no enumeration). Enrollment keeps the entered name in `attendeeName`.
- New guest → light customer (email, first/last name, order locale, `marketingConsent: false`); logs in later via magic link (no link in Wave 2 emails — Q3).
- Entitlements per attendee (same `sourceRef` = orderId). Online courses: quantity 1 only (no multi-licence/gift in Wave 2).
- Seat hold = one row with quantity N, allocated all-or-nothing under the session lock; SOLD_OUT if fewer than N free (UI shows `details.available`).
- Webhook oversell with N > 1 → whole-order refund, no partial fulfilment; `oversell-refund` to buyer only.
- Per-seat price `seatAmount` = floor(total/N), remainder cents on #0; basis for W3 per-seat refund/credit under D1.
- Full refund (Wave 2) → all N seats refunded + all entitlements revoked; `refund-issued` to buyer only (guest notice = W3 cancellation task). Partial refunds in Wave 2 change no seat.
- Guest PII: never in Stripe metadata/URL/logs; on hold rows max 7 days after non-active expiry.
- Guest already enrolled in the same session via another order → allowed (no lookup; staff sees both rows).

**Erick handoffs (consolidated)**
1. ~~Approve this plan + CCR-W2-1…5~~ — done 2026-10-19 (+ CCR-W2-6).
2. Stripe test webhook endpoint: `https://cook-for-friends.vercel.app/api/stripe/webhook?x-vercel-protection-bypass=<automation bypass secret>`, API version `2026-08-26.dahlia`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `invoice.finalized`. Put its signing secret in Vercel `STRIPE_WEBHOOK_SECRET` (Production + Preview) and redeploy. Needed before W2-12 (ideally during 2c).
3. Cloudflare cron worker deploy if not done yet (`infra/cron-worker/README.md`, 6 steps; uses the same automation bypass secret). Needed for automatic hold expiry + email jobs on staging.
4. Add `W2_TEST_EMAIL=<address the Resend test sender can deliver to>` to `apps/web/.env.local` (before W2-05 live smoke / W2-12).
5. Optional: `brew install stripe/stripe-cli/stripe` for local webhook forwarding (agents use `--api-key`, no login). Not blocking.
6. Client (D6): GST/QST numbers + tax code → then `STRIPE_TAX_CODE`, `STRIPE_TAX_ENABLED=true` in Vercel, re-run sync backfill. Only blocks the receipts criterion.

**Risks**
- Vercel Deployment Protection blocks Stripe webhooks → endpoint URL carries the bypass query param (handoff 2). Without it every staging webhook is a 401/SSO redirect.
- Neon pooled endpoint (PgBouncer) + `FOR UPDATE`: F3 says OK; W2-04 must run the race test against the pooled URL too.
- Jobs enum migrations collide if two parallel tasks add task slugs → one migration owner per batch (above).
- Email latency: jobs run inline via `after()` post-commit; cron `*/5` is the fallback. If the worker is not deployed, emails wait for the next manual run.
- Seat hoarding (scripted holds) → per-IP checkout limit + one active hold per cart token. Residual risk accepted for MVP.
- Resend test domain only delivers to the account owner (D8) → acceptance email checks may be partial.
- Shared `messages/{fr,en}.json` merge conflicts in 2b/2c → own namespaces, rebase keeps both.
- Receipts without GST/QST until D6.

**Open questions — Q1–Q5 resolved 2026-10-19:** Q1 yes (single-line cart, quantity 1..max); Q2 yes (card only); Q3 yes (no magic link in W2 emails, incl. guest emails); Q4 yes (10/IP/h); Q5 yes (revalidate 300 s).

**New open questions (default applies if no answer)**
- Q6 Guests get a seat email but no reminder until Wave 3 reminders ship — OK? Default **yes** (W3 reminders cover every attendee).
- Q7 Staff full refund in Wave 2 notifies the buyer only, not guests? Default **yes**; W3 cancellation adds guest notices.
- Q8 Buyer must always attend (attendee #0); "gift seats without attending" not supported? Default **yes**; revisit with gifts.
- Q9 Online courses stay 1 per purchase (no team licences)? Default **yes**.
- Q10 Hard cap 10 on the staff-editable max? Default **yes**.

**Next step:** 2a running (W2-01, W2-02) + W2-03 → W2-02b when W2-01 + W2-02 land → batch 2b (W2-04, W2-05, W2-06).

---

## 2026-10-18 — W1-03 follow-up: CCRs applied, W1-03 closed (backend-engineer)
- **CONTRACT 1.0 -> 1.1** ("2026-10-18 CCR approved by Erick"): `auth-rate-limits` added to identity (§1, §3.2); `customers.sessionVersion` (§3.2), session note (§4), logout semantics (§5.1).
- **Revocable customer sessions**: JWT carries `sessionVersion`; `magicLinkStrategy` rejects a mismatch; logout increments it (all devices revoked). Migration `20261018_114002_sessions_version`.
- **Tests**: 96/96 on a throwaway Neon branch from `dev` (deleted). New: logout rejects old + sibling cookie, new login works; other customer unaffected; field not client-writable.
- **Migration applied**: Neon `dev`, `staging`. Never `production`. Production will pick it up with the normal release migrate.
- **W1-03 complete**: first staging admin created by Erick, `/api/users/init` verified.

## 2026-10-18 — CI integration tests on throwaway Neon branch + smoke fix (devops-agent)
- **CI `integration` job** (needs `verify`): gate step checks `NEON_API_KEY` secret + `NEON_PROJECT_ID` repo variable. Missing -> notice "NEON_API_KEY not set — integration tests skipped", job green. Present -> `neondatabase/create-branch-action` (SHA-pinned, v6.3.1) creates `ci-<run_id>-<attempt>` from `dev` (2h `expires_at` safety net), `pnpm payload migrate` (tests PR migrations), `pnpm test` with `TEST_DATABASE_URL` (all 92 tests), `delete-branch-action` (SHA-pinned, v3.2.1) with `if: always()`.
- Env: dummy non-secret placeholders only (`VIDEO_PROVIDER=none`, `sk_test_ci_placeholder`, R2/Resend placeholders), random `PAYLOAD_SECRET`/`CRON_SECRET` per run, `NEXT_PUBLIC_SKIP_ENV_VALIDATION=0` for this job (Payload config needs real env parsing). No real Stripe/Resend keys.
- Fork PRs get no secrets -> job skips. No `pull_request_target`.
- **`neon-cleanup.yml`**: daily 03:17 UTC + `workflow_dispatch`; deletes `ci-<n>-<n>` branches older than 1 day (never default/protected). Same gating.
- Repo variable `NEON_PROJECT_ID=empty-rain-36048098` set.
- Verified locally on a throwaway branch from `dev` (deleted after): migrate no-op OK, 92/92 tests pass. actionlint clean.
- **Smoke fix:** `/` redirect test pinned with `locale: fr-CA` + Accept-Language; added companion en-US -> `/en`. Both pass locally (3/3).

**HANDOFF for Erick (3 steps) to enable integration tests in CI**
1. Neon console -> Account/Org settings -> API keys -> create key named `github-ci`.
2. `gh secret set NEON_API_KEY -R bnzo-labs/cook-for-friends` (paste key when prompted).
3. `gh workflow run ci.yml -R bnzo-labs/cook-for-friends --ref main` then `gh run watch`, to confirm. The Integration job should run 92 tests instead of the skip notice. Optionally `gh workflow run neon-cleanup.yml -R bnzo-labs/cook-for-friends`.
- Key rotation: depends on CI + cleanup only; rotate yearly or on suspected leak (revoke in Neon console, re-run step 2).

---

## 2026-10-17 — W1-01 follow-up: Payload admin 500 fixed (devops-agent)
- **Root cause:** `src/app/(payload)/` had no `layout.tsx` (Payload `RootLayout` + `serverFunction` + importMap) and no `custom.scss`, so `@payloadcms/ui` client code got no config context: `Cannot destructure property 'config'` -> 500 on `/admin/create-first-user`. Previous "admin loads" tick counted a 307.
- **Fix (64a63b6):** added Payload 3.90.2 blank-template `layout.tsx` + `custom.scss`; importMap now `(payload)/admin/importMap.js` (generator default) with `admin.importMap.baseDir = src` in `payload.config.ts`; removed `(payload)/importMap.ts`; `e2e/admin.test.ts` asserts 200 + form; `.env.example` gains commented `SEED_PASSWORD`, `TEST_DATABASE_URL`; `.gitignore` ignores Playwright artifacts.
- **Verified:** local `pnpm build` green; `next start` `/admin/create-first-user` 200, `/admin/login` 200, `/fr` 200; staging (prod deploy Ready) same three = 200; CI green on main.
- **Note:** `pnpm payload generate:importmap` needs `NEXT_PUBLIC_SKIP_ENV_VALIDATION=1` (or full env). `e2e/smoke.test.ts` "/ redirects to /fr" fails in a browser whose Accept-Language is en (lands on /en); pre-existing, locale detection, not touched.
- **Next:** Erick creates first admin user on staging manually (not done by agent).

## 2026-10-17 — W1-03 identity auth complete (backend-engineer)

**Done**
- Customer magic-link flow at API level: `POST /api/auth/magic-link/{request,verify}` and `POST /api/auth/logout`, with `getCurrentCustomer` / `requireCustomer` / `requestMagicLink` / `verifyMagicLink` / `upsertCustomerByEmail` exported from `@/modules/identity` (CONTRACT §4 surface unchanged).
- Spike: Payload helpers (`jwtSign`, `getFieldsToSign`, `generatePayloadCookie`) work as typed, but Payload's `local-jwt` refuses `disableLocalStrategy` collections and omits the `sessions` field. So `customers` has its own `AuthStrategy` (HS256 Payload-format cookie, `node:crypto`) and `useSessions: false`. Logout clears the cookie only; no server-side revocation (7-day cookie). DISCOVERY §3 fallback shape, no surface change.
- Token: 32 random bytes base64url, SHA-256 hash stored, 15 min TTL, redeemed with one atomic `UPDATE … RETURNING` (concurrent replay: exactly one wins). POST only, so mail scanners cannot burn tokens. `next` sanitized to same-origin paths.
- Rate limits 5/email/h and 20/IP/h in new Postgres table `auth-rate-limits` (migration `20261017_183746_0002_auth_rate_limits`, applied to Neon dev + staging; verified on a throwaway branch, deleted). 429 carries `errors.MAGIC_LINK_RATE_LIMITED`.
- `sendMagicLinkEmail` port with a real FR/EN Resend sender; tests swap it (no real mail sent). W2-04 replaces the sender.
- Tests: 21 integration + 25 unit new; 92/92 on a throwaway DB; CI (no DB) 42 pass / 50 skipped.

**Blocked / notes**
- **Pending Erick:** create the first admin on staging (`/admin/create-first-user`). Staging has 0 users, so the "staff login works on staging" criterion could not be verified live. `/admin/login` = 200 and the new auth routes respond on staging (checked 2026-10-17).
- Contract Change Request (informational): internal collection `auth-rate-limits`; optional `customers.sessions` for revocable sessions. Details in `tasks/W1-03-identity-auth.md`.
- Integration tests still need a DB in CI (Neon branch per run) to stop being skipped.

**Next step**
- W2-04 notifications swaps the magic-link email template via `setMagicLinkEmailSender`. W3-01 builds `/{locale}/auth/verify` (a button that POSTs the token) and the login page.

---

## 2026-10-17 — W1-02 data model complete (backend-engineer, Opus)

**Done**
- Every CONTRACT §3 collection and global now exists in its owning module: catalog (7 collections, 5 page blocks, 2 globals), identity (users, customers, magic-link-tokens), access (entitlements), commerce (5), scheduling (1), learning (3). The W1-01 `users` stub is gone.
- Access helpers live in `@/modules/identity` (`isAdmin`, `isStaffOrAdmin`, `isSelfCustomer`, `ownsDocument`, `publishedOrStaff`, `isStaff`, …). The §3.7 matrix is enforced, and tests cover it.
- Migration `20261017_174125_0001_init`: composite uniques and indexes come from Payload `indexes`. Applied to Neon `dev` (plus seed) and `staging` (migrate only). Verified on a fresh throwaway branch, including a down/up round trip.
- `pnpm seed` (dev): 2 staff, 2 in-person courses × 3 sessions (one with capacity 1), 2 online courses × 3 lessons, 1 product, home page (`accueil`/`home`) with all 5 blocks, site-settings, and cancellation policy with the D1 defaults. All content is FR + EN and idempotent. Staff password comes from `SEED_PASSWORD` (otherwise random and not printed).
- Admin groups: Catalogue / Ventes / Clients / Apprentissage / Paramètres (FR + EN). Money fields are integer cents with a `$` list cell.
- Tests: unit tests run in CI. Integration schema tests (`TEST_DATABASE_URL`, throwaway DB only) pass 46/46 locally and are skipped in CI.

**Platform-owned files touched (minimal, flagged for devops)**
- `payload.config.ts` (stub removed, globals registered, `media` on s3Storage). `package.json` (`seed` script). `importMap.ts` (regenerated). `next.config.ts` (lexical no longer in `serverExternalPackages`, because the build broke once lexical RSC components were in the import map).

**Blocked / notes**
- `apps/web/.env.local` and `.env.staging` have no `R2_*` vars. Local CLI runs need placeholders. Media uploads on staging will fail until devops adds R2 credentials in Vercel.
- `src/app/(payload)/` has no `layout.tsx` (Payload `RootLayout`), and `generate:importmap` writes to `admin/importMap.js` while the page imports `../../importMap`. Devops should add the layout and set `admin.importMap.importMapFile`.
- `.env.example` should document `SEED_PASSWORD` and `TEST_DATABASE_URL`. CI needs a Neon branch per run to execute the integration tests.

**Next step**
- W1-03 identity-auth: add the magic-link strategy to `customers` (`auth.strategies`). The schema is ready.

---

## 2026-10-17 — W1-04 UI foundation complete (frontend-architect)

**Done**
- `src/styles/{tokens,globals,fonts}`: tokens per DESIGN_SPEC §1, Tailwind v4 `@theme inline`, shadcn variable aliases, reduced-motion guard.
- 13 shadcn components in `src/components/ui/` restyled via tokens (Button variants primary/secondary/ghost/link, sizes, loading keeps width).
- `src/components/layout/`: Container, Section, SiteHeader, SiteFooter, LocaleSwitcher (keeps path), NavLinks, MobileNav (Sheet), Logo placeholder.
- Locale layout: `<html lang>`, skip link, landmarks, Toaster, fonts. `ui.*` + `layout.*` messages FR/EN.
- Playwright `e2e/w1-04-shell.test.ts`: 17 tests pass (landmarks, skip link, axe 0 serious/critical at 320 and 1440 both locales, mobile menu, overflow). Screenshots committed.
- 9/9 acceptance criteria ticked. Details and deviations in `tasks/W1-04-ui-foundation.md`.

**Blocked**
- Nothing. Nav targets 404 until storefront/portal pages and translated pathnames exist (W2-05).

**Next step**
- Storefront (W2-05) builds on layout + ui. Brand swap (D4) = edit `tokens.css` + `fonts.ts`, then re-verify contrast.

---

## 2026-10-17 — W1-01 complete, staging deployed (devops-agent)

**Done**
- All 15/15 acceptance criteria met. W1-01 status: complete.
- Staged env vars (Production + Preview) in Vercel from `.env.staging`. Neon staging branch DB.
- Added `VIDEO_PROVIDER=none` enum option to env.ts (Wave 3 configures Mux/Bunny). Prevents build failure without MUX credentials.
- Added `engines.node: ">=22 <23"` to `apps/web/package.json` so Vercel selects Node 22.x.
- Created and applied initial Payload CMS migration (20261017_124119) to Neon staging branch.
- Staging deploy succeeded: `https://cook-for-friends-ericks-projects-960ce4f0.vercel.app` (also aliased to `https://cook-for-friends.vercel.app`).
- Vercel cron scheduler disabled in vercel.json (requires Pro plan; routes exist at /api/cron/*).
- CI green on commit `ba2ceb6`. GitHub → Vercel connection confirmed active.

**Notes for Erick**
- Vercel SSO protection is enabled: disable from dashboard → Settings → Deployment Protection → uncheck "Vercel Authentication" for public access.
- Cron scheduler: upgrade to Vercel Pro and re-enable `crons` key in `apps/web/vercel.json` when ready.

**Next step**
- W1-01 complete → W1-02/03/04 can run in parallel.

---

## 2026-10-12 — W1-01 scaffold complete, CI green, Vercel setup blocked (devops-agent)

**Done**
- Full Turborepo + pnpm monorepo scaffold built and pushed.
- Next 16.3.8 + Payload 3.90.2 + next-intl 4.14.9 — exact pinned versions.
- `pnpm build` green locally and in CI (commit `046c50b`).
- GitHub Actions CI: secret-scan (gitleaks) → lint → typecheck → test → build. All green.
- Root cause of Turbopack worker env isolation fixed: `NEXT_PUBLIC_SKIP_ENV_VALIDATION` instead of `SKIP_ENV_VALIDATION` (Turbopack workers only forward `NEXT_PUBLIC_*` vars).
- Vercel project `cook-for-friends` linked (prj_I1oEe1ZzCbRbFHYcpwlxiGvcNSrW, team ericks-projects-960ce4f0). No deployments yet — GitHub not connected, root dir not configured.

**Blocked**
- Vercel staging deploy requires Erick to complete 3 steps (see task file + below).

**Next step**
- Erick completes Vercel configuration (instructions below), then devops-agent verifies staging URL and ticks final criterion.
- After criterion 14 verified → W1-01 complete → W1-02/03/04 can run in parallel.

---

## 2026-10-11 — Wave 0 approved, Wave 1 starting (orchestrator)

**Done**
- Erick approved DISCOVERY + wave plan.
- Accounts ready: Neon (main/staging/dev), Vercel, Stripe test, Resend, Cloudflare R2, GitHub.
- Repo connected: `origin` = `bnzo-labs/cook-for-friends` (**public**, Erick's choice), `main` tracks `origin/main`. Nothing pushed yet.
- Root `.env.local` filled by Erick (dev branch, Stripe test, Resend, R2). `PAYLOAD_SECRET` and `CRON_SECRET` generated locally. File is gitignored, mode 600.
- Public-repo rules added to W1-01 (secret scan pre-commit + CI, fictional seed data).

**Blocked**
- D9 seats per purchase still blocks Wave 2 checkout.

**Next step**
- W1-01 platform-scaffold → devops-agent (Sonnet) via delegate-task.

---

## 2026-10-07 — Wave 0 discovery (orchestrator, Opus)

**Done**
- Repo state checked: `/Users/erick/work/CookForFriends` is empty (no git). Related systems found outside the repo: `cff-hub` (Supabase dashboard, prod) and `cff-delivery-app` (Shopify). See DISCOVERY §1, R1–R3.
- Versions verified on npm (2026-10-07) and pinned: Next 16.3.8, Payload 3.90.2 (all `@payloadcms/*`), next-intl 4.14.9, stripe 22.6.2 (API `2026-08-26.dahlia`), React 19.2.8, TS 5.9.3, pnpm 11.28.5, Node 22. `@payloadcms/plugin-stripe` rejected (bundles stripe ^10).
- Auth strategy decided: `users` (staff, password) + `customers` (custom magic-link strategy with Payload `jwtSign`/`generatePayloadCookie`, scanner-safe POST verify).
- i18n model decided: one `locales.ts` shared by next-intl and Payload localization, FR default, `localePrefix: 'always'`.
- Video: `VideoProvider` interface, Mux adapter first behind `VIDEO_PROVIDER`.
- Key finding: Stripe Checkout minimum expiry is 30 min, longer than the 15-min hold. Handled by hold accounting + webhook re-check + auto-refund.
- Written: `CLAUDE.md`, `docs/DISCOVERY.md`, `docs/CONTRACT.md` (v1.0-draft), `docs/MASTER_BUILD_SPEC.md`, `docs/DESIGN_SPEC.md`, Wave 1 task briefs `tasks/W1-0*.md`.

**Blocked / needs client decision**
- D9 seats per purchase — **blocks Wave 2 checkout** (default 1).
- D6 GST/QST registration numbers + tax code — blocks the receipt acceptance criterion.
- D8 domain layout vs Shopify + email sending domain — blocks production + deliverability.
- D11 Vercel Pro — needed for 5-min cron on staging (Wave 2).
- D1, D2, D3, D4, D5, D7, D10 — non-blocking for Wave 1 (defaults in DISCOVERY §8).

**Needs from Erick to start Wave 1**
- Approve DISCOVERY + wave plan.
- Accounts/keys: Neon project, Vercel team (Pro?), Stripe test account, Resend, Cloudflare R2, GitHub repo name.

**Next step**
- On approval: delegate `tasks/W1-01-platform-scaffold.md` → devops-agent (Sonnet) via delegate-task.

---

## 2026-10-18 — D11 resolved: Cloudflare cron worker (devops, Opus)

**Done**
- `infra/cron-worker/` (pnpm workspace pkg `@cff/cron-worker`): Worker `cff-cron-staging`. `*/5` -> expire-holds + jobs, hourly -> reminders. Sends `Authorization: Bearer CRON_SECRET` + `x-vercel-protection-bypass`. 12 vitest tests. Runs in root `pnpm typecheck` / `pnpm test` (CI).
- wrangler 4.144.0 and @cloudflare/workers-types 5.20261004.1 pinned. `workerd` added to pnpm `allowBuilds`.
- DISCOVERY D11 + F7 updated. `apps/web/vercel.json` untouched (no crons key).
- Local check with `wrangler dev --test-scheduled` against local `next dev`: all 3 routes 200; wrong secret -> 401 -> worker 500.

**Needs from Erick (not done, credentials are yours)**
1. Vercel -> Settings -> Deployment Protection -> Protection Bypass for Automation -> create secret.
2. `cd infra/cron-worker && pnpm exec wrangler login`
3. `pnpm exec wrangler secret put CRON_SECRET` (staging value from `apps/web/.env.staging`), then `pnpm exec wrangler secret put VERCEL_BYPASS_SECRET`.
4. `pnpm exec wrangler deploy`; `pnpm exec wrangler tail` at next `*/5` tick -> expect 200s.
Details + rollback + rotation: `infra/cron-worker/README.md`.

