---
type: task
id: W4-01
status: complete-pending-live
wave: 4
batch: 4b
module: quality
agent: e2e-runner
model: sonnet
depends-on: [W3-11, W4-00, W4-03b]
supersedes: [W2-12]
migration-owner: false
---

# W4-01 — E2E purchase flows in CI against Stripe test mode (both flows + expired-hold refund); subsumes W2-12

## Mission
Playwright in the CI `e2e` job proves MASTER §9 "Playwright covers both purchase flows end to end against Stripe test mode": (A) in-person 3-seat purchase (buyer + 2 guests) → confirmation + `.ics` → attendee list/CSV; (B) online purchase → magic link → portal shows only the entitled course → player; (C) expired-hold oversell → automatic refund. Same specs run in **two modes** set by W4-00: `live-test` (real Stripe sandbox, hosted Checkout, `stripe listen`) and `signed-events` (no key: synthetic, correctly signed webhook events). This task also closes **W2-12** (staging acceptance blocked on staging DB writes + missing staging webhook secret): every W2-12 criterion is re-homed here; the parts that only exist on real infrastructure move to the W4-06 post-deploy smoke.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry; W2-12/W3-11 notes) · 3. this file
4. `tasks/W2-12-wave2-acceptance-staging.md` (criteria being re-homed) · `tasks/W3-11-*.md` (completion notes: CI job, seed, stubs)
5. `docs/MASTER_BUILD_SPEC.md` §4 rules 2–3, §9, §11 · `docs/CONTRACT.md` §3.4, §5.1, §6
6. `apps/web/test/e2e-seed.ts`, `apps/web/test/{fixtures,integration}.ts`, `apps/web/e2e/w2-10-booking.test.ts`, `apps/web/e2e/w3-01-portal.test.ts`, `.github/workflows/ci.yml` (`e2e` job after W4-00)

## Ownership
`apps/web/e2e/w4-01-*.test.ts`, `apps/web/test/e2e-stripe/**` (mode switch, signed-event builder, DB assertion helpers, magic-link token minting helper — test-only, never imported by `src/**`), edits to `apps/web/test/e2e-seed.ts` (owned by W3-11 until merged; W4-01 only appends its fixtures). Status line of `tasks/W2-12-*.md` is already set by the plan — do not edit.

## Dependencies
W3-11 + W4-00 merged (CI job with `E2E_STRIPE_MODE`). W4-03b merged (it touches `api/checkout` + webhook logging; run on the hardened code). Parallel with W4-02 and W4-04 (disjoint paths).

## Mode contract (from W4-00)
- `live-test`: `STRIPE_SECRET_KEY` = sandbox key, `STRIPE_WEBHOOK_SECRET` = `stripe listen` session secret, events forwarded to `localhost:3000`. Courses must be synced to the sandbox first (run the `stripe-sync-course` job via `/api/cron/jobs` with `CRON_SECRET`, poll `stripeSyncStatus: 'synced'`). Hosted Checkout: card `4242 4242 4242 4242`, any future expiry/CVC, Canadian postal code if asked.
- `signed-events`: no Stripe network. After `POST /api/checkout` (W3-11 stub), build `checkout.session.completed` / `charge.refunded` / `invoice.finalized` payloads with the exact metadata the app writes (`cartToken`, `holdId`, `courseId`, `sessionId`, `locale`, `quantity`), sign with `Stripe.webhooks.generateTestHeaderString` + the exported secret, POST raw to `/api/stripe/webhook`. Refund calls hit the stub; assert app state only. Hosted-Checkout criteria → "not testable in signed-events mode" (recorded, not failed).
- A spec never assumes a mode silently: each test logs the mode; Completion notes list per-criterion mode evidence.

## Tasks
1. Fixtures (append to `e2e-seed.ts` or `test/e2e-stripe/fixtures.ts` called by it; idempotent; `[E2E]` prefix): in-person course 1000 cents, sessions capacity 4 and capacity 1; online course 2000 cents with 2 lessons (fake video). `maxSeatsPerPurchase` = 4.
2. **Flow A — in-person, FR** (`w4-01-in-person.test.ts`): `/fr/cours/<slug>` → book capacity-4 session → `/fr/panier` qty 3, buyer + guests `Invité Un`/`Invitée Deux` (`e2e+g1@example.test`, `e2e+g2@example.test`) → pay → `/fr/commande/merci` 200 + heading. DB within 60 s: order `paid`, `CFF-` number, qty 3, total 3000 (+tax if enabled); 3 enrollments `confirmed` (attendeeIndex 0..2, 3 distinct customers, Σ `seatAmount` = total); 3 `purchase` entitlements; processed event outcome `applied`; hold `converted`; course page shows 1 seat left. Jobs: 1 `order-confirmation` (lists guests) + 2 `enrollment-confirmation`, each input with exactly 1 `.ics` attachment. Webhook replay: re-POST the same event (signed-events) or `stripe events resend` (live) → outcome `skipped`, counts unchanged.
3. **Attendee list:** seeded staff logs in to `/admin` → session Participants panel shows 3 rows (guests badged, booked-by buyer); `/api/sessions/<id>/attendees.csv` with staff cookie → 200 `text/csv`, BOM, 3 emails, `Booked by` column; anonymous → 401.
4. **Validation smoke:** qty 2 with guest email = buyer email → inline error, no hold row.
5. **Flow B — online, EN then FR** (`w4-01-online.test.ts`): `/en/courses/<online slug>` → buy (qty fixed 1) → success page. Magic link: request via `/en/auth/login`, then mint/redeem the token through the test helper (email delivery is mocked in CI) → `/en/account` lists **exactly** the purchased course (seeded other courses absent); player opens lesson 1, `/api/video/playback` 200 for the buyer; a second seeded customer without entitlement → player 403 + playback 403; signed-out playback → 401.
6. **Flow C — expired-hold refund** (`w4-01-oversell.test.ts`, capacity-1 session): context A starts Checkout (hold A); helper sets hold A `expiresAt` into the past and runs `/api/cron/expire-holds`; context B buys the seat; A completes its still-open Checkout (live) or A's completed event is delivered (signed) → order A `refunded` (live: Stripe refund object exists for A's PaymentIntent), processed outcome `refunded`, `oversell-refund` job for A, B holds the only enrollment. Also hold expiry: an unpaid hold past `expiresAt` + cron → `expired`; live mode: its Checkout session `expired` in Stripe.
7. **Receipt:** order from flow A — live: `invoice.finalized` sets `invoicePdfUrl`; `/api/orders/<id>/receipt` anon → 404/403, buyer cookie → 302 to Stripe; signed-events: send a synthetic `invoice.finalized`, same assertions. GST/QST lines → "deferred (D6)" while `STRIPE_TAX_ENABLED=false`.
8. **EN smoke** of `/en/cart` and FR/EN success pages (200, translated heading). axe 0 serious/critical on cart + success at 320 + 1440.
9. Cleanup (live): archive `[E2E]` Products/Prices in the sandbox at the end (`afterAll`), leave test payments for audit.
10. Write the W2-12 mapping table in Completion notes: each W2-12 criterion → W4-01 test name / mode, or "moved to W4-06 post-deploy smoke" (staging webhook endpoint delivery, Vercel deploy, Cloudflare cron ticks, real Resend delivery incl. plus-addressing D8).

## Done When
- [x] Flows A, B, C + receipt + validation + EN smoke green in CI in `signed-events` mode (run link).
- [~] (pending Erick handoff; interim evidence = signed-events run) Same specs green in `live-test` mode (run link) — or, if `STRIPE_CI_SECRET_KEY` is still absent, marked "pending Erick handoff" with the signed-events run as interim evidence (task stays `complete-pending-live`; orchestrator re-runs CI once the secret exists).
- [x] Replay leaves counts unchanged; oversell refund leaves exactly one enrollment on the capacity-1 session.
- [x] No fixed sleeps; assertions scoped to `[E2E]` fixtures; no secret in logs/artifacts.
- [x] W2-12 mapping table complete; nothing in it is "untested" without a named owner (W4-01 mode or W4-06 smoke step).

## Erick handoffs (workaround in brackets)
1. `STRIPE_CI_SECRET_KEY` from a dedicated Stripe sandbox (W4-00 handoff 1) AND repo variable `E2E_STRIPE_LIVE=true` (serializes the e2e job on the shared sandbox; without it each run gets its own concurrency group). [signed-events mode]

## DO NOT TOUCH
`apps/web/src/**` (product bug → `tasks/W4-1N-fix-<slug>.md`, owner per CONTRACT §1, `status: blocked`, exit), `.github/**`, `playwright.config.ts`, `lighthouserc.json`, staging (DB, Vercel, staging Stripe webhook), Stripe live mode.

## Operating rules (Wave 4 — standing, from Wave 1–3 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-<id> -b <id> origin/main` (`<id>` = lower-case task id, e.g. `w4-01`); then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests. Never in production.
- **Machine load rule: NO full local `next build`, NO `next start`/`next dev` app boot, NO parallel `tsc` runs.** Allowed locally: targeted `vitest run <file>`, single `pnpm -C apps/web typecheck` (one at a time), `pnpm -C apps/web lint`. **CI is the evidence** — push to your PR branch and read the CI run (`gh run watch`, `gh run view --log-failed`). Playwright and Lighthouse run only in the CI `e2e` job.
- **Never set `PAYLOAD_DB_PUSH=1`** and never boot Payload in dev mode against shared Neon `dev`/`staging` (schema push corrupted enums once, PR #12).
- **Neon:** `neonctl branches create` may be denied — do **not** work around it (no other credentials, no other tools). Integration tests run in CI on the per-run branch; make sure your tests actually run there (not skipped). **Never Neon `production` (`main` branch).** **Never write to staging** (DB, Stripe staging webhook, Vercel env) without an explicit Erick OK recorded in this file.
- **Migrations:** only the migration owner named in the plan (Wave 4: W4-03b, only if a finding needs it) runs `migrate:create` and regenerates `src/payload-types.ts`; up/down/up proven in CI. Orchestrator applies after merge. Anyone else needing schema → `## Contract Change Request` here, `status: blocked`, exit.
- **Payload unique conflicts:** detect by the error's column/field **path** (e.g. `error.data.errors[].path`), never by matching message text (localized / driver-specific).
- **i18n:** every next-intl `t()` with ICU placeholders gets its values. FR + EN key parity (i18n test): add both or neither, only under your namespace(s); on rebase conflict keep both sides.
- **`[locale]` routes:** `assertLocale(params.locale)` before any DB/module call.
- **Dates:** `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`; no CSS `capitalize`/`uppercase` on FR dates.
- **Contrast:** text ≥ 4.5:1; secondary text `text-fg-muted`, never `text-fg-subtle`; no hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome in CI (`PW_CHANNEL=chrome`); deterministic waits (poll DB/HTTP), no fixed sleeps; assertions scoped to your own fixtures (no global counts — the CI branch is shared by all specs in the run).
- **Secrets:** never print, log or commit keys/secrets/bypass tokens; `::add-mask::` anything derived in CI.
- **Git:** small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Never force push** (need main? merge `origin/main` into your branch). Push, **open a PR** (`gh pr create`, title `<type>(<ID>): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, CI run link(s), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`** or `docs/MASTER_BUILD_SPEC.md`. Notes go in the PR body and `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Fully autonomous.** Never wait for Erick: every handoff has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR note, exit. Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

## Completion notes

**PR:** https://github.com/bnzo-labs/cook-for-friends/pull/41
**CI run (signed-events, all jobs green, 10/10 W4-01 tests pass, 143 passed / 4 skipped overall):** https://github.com/bnzo-labs/cook-for-friends/actions/runs/43875477692
**Live-test mode:** pending Erick handoff (`STRIPE_CI_SECRET_KEY` + repo var `E2E_STRIPE_LIVE=true`). Live branches (hosted Checkout fill, real-event replay, product archive) are written but unverified. Task = complete-pending-live; orchestrator re-runs CI once the secret exists.

**Deviations**
- The "W3-11 stub" did not exist in the app. Added a test-only fake Stripe wire (`apps/web/test/e2e-stripe/fake-stripe-server.mjs`) + `stripe-redirect.cjs` (NODE_OPTIONS preload redirecting api.stripe.com to the fake). Only network calls are faked; checkout, webhook, refund, hold logic run for real. `ci.yml` "Start server" step starts it in signed-events mode only.
- `ci.yml` e2e concurrency group is now `e2e-stripe-live` only when repo var `E2E_STRIPE_LIVE == 'true'`, else per-run (single-pending-run starvation fix).
- Flow C: hold A expiry is set in the past WITHOUT running expire-holds (cron would expire A's Checkout session, so A could not pay in live mode). Cron path is covered by the separate hold-expiry test.
- Fixtures are per-spec unique `[E2E]` rows (not one shared set) for retry isolation. Admin guest badge has no test id: asserted via 3 attendee rows + emails.
- Emails asserted on queued `send-email` job input (idempotency key, 1 `.ics`, guests listed), not delivery (placeholder Resend key keeps rows queued).

**Per-criterion evidence (mode: signed-events)**
- Flow A (3 seats FR, order/enrollments/entitlements/hold/jobs/1 seat left): w4-01-in-person A1. Replay `skipped`, counts unchanged: A2.
- Attendee list + CSV (BOM, Booked by, anon 401): A3.
- Receipt (invoice.finalized, anon 403/404, buyer 302): A4. GST/QST lines: deferred (D6, STRIPE_TAX_ENABLED=false).
- Flow B EN + FR (magic link via minted token, exactly one course, player, playback 200/403/401): w4-01-online.
- Flow C oversell refund + hold expiry (fake Stripe refund and session `expired` asserted): w4-01-oversell.
- Validation smoke, EN/FR cart + success pages, axe 0 serious/critical at 320 + 1440: w4-01-smoke.
- Hosted Checkout (card 4242) criteria: "not testable in signed-events mode" (recorded, not failed).

**W2-12 mapping**
| W2-12 criterion | Owner |
|---|---|
| Fixture script + course synced to Stripe | W4-01 fixtures (signed: fixture price ids; live: real stripe-sync-course job) |
| Purchase 3 seats FR, hosted Checkout | W4-01 A1 (signed-events); hosted page: live-test pending |
| Order/3 enrollments/3 entitlements/events/hold/1 seat left | W4-01 A1 |
| Emails: 1 order + 2 enrollment each with .ics | W4-01 A1 (queued job input); real Resend delivery incl. plus-addressing D8 -> W4-06 post-deploy smoke |
| Attendee list + CSV | W4-01 A3 |
| Validation smoke | W4-01 smoke |
| Hold expiry + Stripe session expired | W4-01 hold expiry test |
| Oversell refund | W4-01 C |
| Receipt / GST-QST | W4-01 A4; GST/QST deferred D6 |
| EN smoke | W4-01 smoke |
| CI R5/R6 tests ran | integration job (green, run above) |
| Cleanup | W4-01 afterAll (live: archive products) |
| Staging webhook endpoint delivery, Vercel deploy, Cloudflare cron ticks, real Resend delivery | W4-06 post-deploy smoke |
