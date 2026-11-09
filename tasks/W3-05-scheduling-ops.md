---
type: task
id: W3-05
status: pending
wave: 3
batch: 3b
module: scheduling (+ admin-ext attendance)
agent: backend-engineer
model: sonnet
depends-on: [W3-07, W3-08, W3-09]
migration-owner: false
---

# W3-05 — Scheduling ops: waitlist, reminders 48 h/24 h, per-seat cancellation policy, attendance marking

## Mission
Run in-person operations (MASTER §3.4): visitors join a waitlist for full sessions and are emailed when a seat frees; every attendee (guests too) gets reminders with `.ics`; a buyer or staff cancels a seat and the configurable policy (D1) decides refund / credit / none; staff mark attendance. Backend + admin attendance control; portal/storefront UI is W3-01b.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.1 (`site-settings`, `cancellation-policy`), §3.5 (`waitlist-entries`, `reminder-deliveries`), §4 `@/modules/scheduling` (CCR-W3-5), commerce (CCR-W3-4), catalog (`getSessionView`, `listSessionsStartingBetween`, `getSiteSettings`, `getCancellationPolicy`), notifications (CCR-W3-3), §5.1 waitlist/enrollments/cron rows, §6 internal jobs
5. `docs/DISCOVERY.md` §7 R9 R11, §8 D1 D9 D10, F10
6. `apps/web/src/modules/scheduling/**`, `src/app/api/cron/reminders/route.ts`, `src/admin/SessionAttendees/**`, `infra/cron-worker/README.md` (hourly → `/api/cron/reminders`)

## Decisions in force
- **D1** (late-bound): policy from `getCancellationPolicy()`. Seed/default when the global is empty: `≥ 72 h refund 100 %`, `24–72 h credit 100 %`, `< 24 h none` (DISCOVERY D1). Evaluation: `hoursBefore = (session.startsAt − now) / 3600 s`; first tier (desc) with `hoursBefore ≥ minHoursBefore`; none matches → `none`. `amount = floor(seatAmount × percent / 100)` cents. Session already started or `status ≠ scheduled` → customer cancel not allowed (`CONFLICT`); staff may cancel any time; the outcome still follows the policy (**no staff override in MVP** — exceptions are handled manually; admin refund tooling is a Wave 4 candidate). `customerCanSelfCancel = false` → customers get `FORBIDDEN`, staff still can. Session `cancelled` by staff (whole session) is **out of scope** here — note it for Wave 4 (bulk refund).
- **Q11/Q12 defaults:** customer actor must be the **buyer** of that seat's order (`EnrollmentView.buyerCustomerId`); guests see "contact the person who booked". Money to the buyer (commerce does it). Emails: buyer gets `cancellation-confirmation` (`recipient: 'buyer'`, outcome, amount, credit code); if the attendee is a guest (≠ buyer) they get `recipient: 'attendee'` (no amounts). Idempotency keys `cancel-<enrollmentId>-buyer|attendee`.
- **Flow** `cancelEnrollment({ enrollmentId, by, actorId })`: load view → authorize → `previewCancellation` math → `commerce.executeSeatCancellation` → on `ok` enqueue emails + `onSeatReleased(sessionId)`; on `UPSTREAM` (Stripe failed after seat cancelled) return the error — the route is safely retryable (commerce retries refund only); emails only after `ok`. Seat already `cancelled` with refund pending → a retry call returns `ok` once commerce reports the refund done (no duplicate emails thanks to keys).
- **D10 waitlist:** `joinWaitlist`: session must be `scheduled` and future; email normalized; duplicate `(session, email)` → `ok` (no enumeration, no error); leave `customer` empty (never create customers from a waitlist join). Route `POST /api/waitlist` public, Origin check, 5/IP/h + 3/email/h (`consumeRateLimit` namespace `waitlist`), always `200 { ok: true }` on valid input. `onSeatReleased(sessionId)` (called by commerce webhook and by cancellation): if available seats (`commerce.getAvailableSeats`) > 0 → take the next `waitlistNotifyCount` (default 3) `waiting` entries FIFO by `createdAt`; skip + mark `converted` any whose email already holds a confirmed seat in that session (`commerce.listAttendees`); mark the rest `notified` + `notifiedAt` and enqueue `waitlist-seat-available` (key `waitlist-<entryId>`) with localized absolute `bookUrl` to the course detail page. Each entry is notified at most once (Q16 default). Entries for sessions that have started → `expired` (done lazily in `sendDueReminders` sweep). Concurrency: two `onSeatReleased` calls at once must not double-notify the same entry (conditional update `status = waiting → notified` and act only on rows actually updated).
- **Reminders** `sendDueReminders(now)`: offsets from `site-settings.reminderOffsetsHours` (default `[48, 24]`). For each scheduled session starting in `(now, now + maxOffset h]` (`catalog.listSessionsStartingBetween`), for each `confirmed` attendee row (`commerce.listAttendees` — buyer **and guests**, Q6): pick the **smallest offset o with `startsAt − now ≤ o h`** not yet delivered; skip if the enrollment was created less than `o` h before start (its confirmation email is enough); insert `reminder-deliveries (enrollment, o)` — unique violation → skip (exactly-once across overlapping cron runs); then enqueue `reminder` in the attendee's `locale` with `.ics` (`IcsInput`, `uid = session-<id>@cookforfriends`) and `accountUrl`. Insert + enqueue in one transaction (rollback → no row, no job). Returns `{ sent }`.
- **Cron:** `GET /api/cron/reminders` (approved exception in platform path) → `sendDueReminders()`; bearer check kept; returns `{ ok, sent }`.
- **Attendance:** `markAttendance({ enrollmentId, attendance, staffId })` → `commerce.setEnrollmentAttendance`. Admin: extend `src/admin/SessionAttendees` (admin-ext, W2-09's component) with a present/absent/unknown control per row calling a staff-only route `POST /api/enrollments/:id/attendance` (scheduling-owned path, staff session, Origin check). Attendance only for sessions that have started or are today (Toronto) — otherwise control disabled.
- **Preview** for the portal: `previewCancellation({ enrollmentId, actorCustomerId })` → `{ allowed, reason?, outcome, percent, amount, hoursBefore, deadlineNextTier? }` — W3-01b renders it server-side; no extra route.

## Acceptance criteria
- [ ] Exports per CONTRACT 1.3 `@/modules/scheduling` (CCR-W3-5); `onSeatReleased` replaces the Wave 2 log-only body.
- [ ] Unit: tier evaluation table (boundaries exactly 72 h / 24 h, empty tiers → none, percent rounding floor, unsorted guard); reminder offset selection (booked 30 h before → only 24 h reminder; booked 10 h before → none; cron hourly across 72 h → exactly one 48 h + one 24 h).
- [ ] Integration (throwaway branch, Stripe + email at their ports): buyer cancels guest seat at 100 h → refund requested for that seat only, 2 emails (buyer + attendee), waitlist next 3 notified, seat count +1; at 48 h → credit code emailed to buyer; at 10 h → none, seat freed; guest tries to cancel → `FORBIDDEN`; other customer → `FORBIDDEN` (route 404); staff cancels → allowed; `customerCanSelfCancel=false` → customer `FORBIDDEN`; double cancel → `CONFLICT`; Stripe failure → `UPSTREAM`, retry succeeds, emails once.
- [ ] Waitlist: join duplicate → still one row; rate limit 429; concurrent `onSeatReleased` ×3 → each entry notified once; already-enrolled email → `converted`, not emailed.
- [ ] Reminders: overlapping concurrent `sendDueReminders` ×2 → one reminder per (enrollment, offset); guests receive their own in their locale; cancelled seats skipped; `/api/cron/reminders` 401 without bearer, 200 `{ ok: true, sent: n }` with.
- [ ] Attendance: staff route 200; customer/anon 401/403; cancelled seat → 409; admin control Playwright smoke + screenshot `e2e/__screenshots__/w3-05/`.
- [ ] Routes: `POST /api/enrollments/:id/cancel` (customer-buyer or staff, Origin check) → `{ outcome, amount }` / error envelope; `POST /api/waitlist`; `POST /api/enrollments/:id/attendance`.
- [ ] Coverage ≥ 80 % `scheduling/server/**`. typecheck/lint/test green; CI integration not skipped; Vercel preview Ready. Staging probes for PR body: `/api/cron/reminders` bearer → 200.

## Files to create / edit
- Create/edit: `apps/web/src/modules/scheduling/**` (not `collections/reminder-deliveries.ts` fields — W3-07's), `src/app/api/waitlist/route.ts`, `src/app/api/enrollments/[id]/{cancel,attendance}/route.ts`.
- Edit (exceptions): `src/app/api/cron/reminders/route.ts`; `src/admin/SessionAttendees/**` (attendance control only) + `importMap.js` if regenerated.
- Edit: `messages/{fr,en}.json` under `scheduling.*` (admin control labels may be inline FR/EN).

## DO NOT TOUCH
`commerce/**` (call its index; need more → CCR + stop), catalog/notifications internals, collection fields, `src/app/(frontend)/**` (W3-01b), migrations, `payload-types.ts`, `infra/**` (hourly reminders already scheduled).

## Erick handoffs
- D1 (client): real cancellation tiers → staff edit `/admin/globals/cancellation-policy`. Workaround: DISCOVERY default tiers seeded/used when empty.
- D10: `waitlistNotifyCount` default 3, editable in site settings. No action needed.
- Confirm the Cloudflare cron worker is deployed with the hourly `/api/cron/reminders` trigger (README). Workaround: orchestrator triggers it manually with `vercel curl` during acceptance.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-05 -b w3-05 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W305_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-05/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-05): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

