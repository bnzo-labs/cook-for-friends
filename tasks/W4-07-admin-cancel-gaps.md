---
type: task
id: W4-07
status: complete
wave: 4
batch: 4d
module: scheduling · commerce · catalog · notifications (admin surfaces)
agent: backend-engineer
model: opus
depends-on: [W4-03b, W4-05]
migration-owner: true (job slug `session-cancel` → payload_jobs task_slug enums only)
---

# W4-07 — Admin gaps from the W4-05 guide review (session cancel, staff seat cancel, dollars, FR labels)

## Mission
Close the four admin gaps W4-05 surfaced while writing `docs/GUIDE_ADMIN_FR.md` ("À vérifier"): staff can cancel a whole session and every participant is refunded and told; staff can cancel one seat from the admin with an exact preview; money is entered in dollars; no English labels left in the admin screens staff use.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` · 3. this file
4. `docs/CONTRACT.md` §3.1, §3.4, §3.5, §4 (commerce seats, scheduling, notifications `cancellation-confirmation`), §5.1 (`/api/enrollments/:id/cancel`)
5. `tasks/W4-03b-security-carryovers.md` (M-2 `seatCancellationCap`, L-2 persisted amount, L-12 pool note) · `docs/GUIDE_ADMIN_FR.md` §2, §3, §5, §7, §8, §11, "À vérifier"

## Ownership
`src/modules/scheduling/**` (session-cancel job + staff cancel modes), `src/modules/catalog/collections/{sessions,courses}.ts` + `fields/money.ts` (hook that queues the job by slug, dollars mirror, labels), `src/modules/commerce/{collections,money.ts,admin}/**` (labels, dollars mirror/display — no change to seat/refund logic), `src/modules/notifications/{types,server/validate,templates/cancellation-confirmation}.ts*` + `src/i18n/messages/{fr,en}.json` (`notifications.emails.cancellationConfirmation` only), `src/admin/**`, `src/app/api/enrollments/[id]/cancel/route.ts`, `src/payload.config.ts` (jobs.tasks line only), one migration, `src/payload-types.ts`, admin `importMap.js`, `docs/GUIDE_ADMIN_FR.md`, `docs/CONTRACT.md` (additive change log entry).

## Tasks (refund logic: failing test first)
1. **Session cancel.** Staff sets a session status to **Annulée** → `sessions` afterChange (catalog, by slug, like `stripe-sync-course`) queues job `session-cancel` (owned by scheduling) in the same transaction. The job, sequentially (W3-10 L-12: one seat at a time):
   - re-reads the session each seat; stops if it is no longer `cancelled` (flip back = no further refunds; already-cancelled seats stay cancelled);
   - every `confirmed` seat → `executeSeatCancellation` outcome `refund` for the seat's **remaining refundable amount** = `getSeatCancellationCap(seat).cap` (M-2: Dashboard refunds respected; outside the D1 tiers); cap 0 → outcome `none`;
   - every seat already cancelled with a **pending refund** (Stripe failed earlier) → retried with the persisted amount (L-2);
   - per-seat Stripe idempotency key stays `seat-cancel-<enrollmentId>`; emails keyed `session-cancel-<enrollmentId>-{buyer,attendee}`; template `cancellation-confirmation` with `reason: 'session-cancelled'` (FR/EN, ICU);
   - Stripe failure on any seat → job throws after the loop → Payload retry (backoff) resumes; seats already done are skipped (no double refund);
   - waitlist entries `waiting`/`notified` of the session → `expired` (no email; `onSeatReleased` already ignores non-scheduled sessions).
   Re-saving a session that is already `cancelled` queues the job again (idempotent resume). `cancelled → scheduled` queues nothing.
2. **Staff cancel-seat action in the admin.** Per confirmed participant (session Participants table) and on the enrollment edit view: **Annuler la place** → preview (`previewStaffCancellation`: policy outcome via `previewCancellation` + full refund amount via the M-2 cap) → choose **Remboursement complet** or **Selon la politique** → confirm → `POST /api/enrollments/:id/cancel { mode }`. `mode: 'full'` is staff-only (customer → 403). Staff preview: `GET /api/enrollments/:id/cancel` (staff only).
3. **Dollars.** Course price and discount-code amounts are entered in dollars (virtual `…Dollars` mirror field, converted to cents in `beforeValidate`; storage unchanged in cents; ≥ 0, ≤ 2 decimals). Read-only money (orders, seats) shown formatted in dollars.
4. **FR labels.** Discount codes, Stripe sync fields (courses, discount codes, orders), session **Lieu** sub-fields, orders (amounts, items, refunds), enrollments: localized `{ fr, en }` labels.
5. Update `docs/GUIDE_ADMIN_FR.md` (§2 prix, §3 annuler une séance, §5 codes promo, §6 crédits, §7/§8 annulation par le personnel, §11 montants, "À vérifier").

## Done When
- [x] Integration tests (CI `integration`): session cancel full refund per seat incl. Dashboard-refunded order (cap), partial Stripe failure → resume without double refund, flip back stops, waitlist cleaned, emails once per seat; hook queues on → cancelled and not on → scheduled; staff `full` vs `policy` preview + cancel; customer `full` → 403.
- [x] Unit tests: dollars ↔ cents conversion + validation; template `session-cancelled` variant FR/EN; i18n key parity.
- [x] Migration `20261116_022748_w4_07_session_cancel_job` (enum values only), up/down/up in CI `integration`. NOT applied to dev/staging.
- [x] `pnpm -C apps/web typecheck` + targeted vitest + lint locally; CI green.
- [x] Guide updated; CONTRACT change log entry (additive: scheduling `previewStaffCancellation`, `cancelEnrollment.mode`, `schedulingJobTasks`, route GET + body `mode`, email data `reason`).

## Erick handoffs
- None (orchestrator applies the migration after merge).

## DO NOT TOUCH
`.github/**`, `package.json`, `next.config.ts`, `proxy.ts`, `src/lib/env.ts`, commerce seat/refund internals (`seats/cancel.ts`, `seats/cap.ts`, webhook), storefront/portal UI.

## Operating rules (Wave 4 — standing, from Wave 1–3 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-<id> -b <id> origin/main` (`<id>` = lower-case task id, e.g. `w4-07`); then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests. Never in production.
- **Machine load rule: NO full local `next build`, NO `next start`/`next dev` app boot, NO parallel `tsc` runs.** Allowed locally: targeted `vitest run <file>`, single `pnpm -C apps/web typecheck` (one at a time), `pnpm -C apps/web lint`. **CI is the evidence** — push to your PR branch and read the CI run (`gh run watch`, `gh run view --log-failed`). Playwright and Lighthouse run only in the CI `e2e` job.
- **Never set `PAYLOAD_DB_PUSH=1`** and never boot Payload in dev mode against shared Neon `dev`/`staging` (schema push corrupted enums once, PR #12).
- **Neon:** `neonctl branches create` may be denied — do **not** work around it (no other credentials, no other tools). Integration tests run in CI on the per-run branch; make sure your tests actually run there (not skipped). **Never Neon `production` (`main` branch).** **Never write to staging** (DB, Stripe staging webhook, Vercel env) without an explicit Erick OK recorded in this file.
- **Migrations:** only the migration owner named in the plan (W4-07: this task, job slug enum only) runs `migrate:create` and regenerates `src/payload-types.ts`; up/down/up proven in CI. Orchestrator applies after merge. Anyone else needing schema → `## Contract Change Request` here, `status: blocked`, exit.
- **Payload unique conflicts:** detect by the error's column/field **path** (e.g. `error.data.errors[].path`), never by matching message text (localized / driver-specific).
- **i18n:** every next-intl `t()` with ICU placeholders gets its values. FR + EN key parity (i18n test): add both or neither, only under your namespace(s); on rebase conflict keep both sides.
- **`[locale]` routes:** `assertLocale(params.locale)` before any DB/module call.
- **Dates:** `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`; no CSS `capitalize`/`uppercase` on FR dates.
- **Contrast:** text ≥ 4.5:1; secondary text `text-fg-muted`, never `text-fg-subtle`; no hard-coded colors (DESIGN_SPEC §7).
- **Secrets:** never print, log or commit keys/secrets/bypass tokens; `::add-mask::` anything derived in CI.
- **Git:** small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Never force push** (need main? merge `origin/main` into your branch). Push, **open a PR** (`gh pr create`, title `<type>(<ID>): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, CI run link(s), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`** or `docs/MASTER_BUILD_SPEC.md`. Notes go in the PR body and `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Fully autonomous.** Never wait for Erick: every handoff has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR note, exit. Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

## Completion notes

Branch `w4-07`, PR #37. CI run 43793915294: verify, integration (Neon; `session-cancel.test.ts` 10 tests ran; migrate up/down/up), e2e all green.

### Items
| # | Status | Where |
|---|---|---|
| 1 Session cancel | done | `scheduling/server/session-cancel.ts` (`cancelSessionSeats`, task `session-cancel`, retries 8 exp 60 s), hook `catalog/collections/sessions.ts enqueueSessionCancel` |
| 2 Staff seat cancel UI | done | `src/admin/CancelSeat/*`, Participants column + enrollment ui field; `previewStaffCancellation`, `cancelEnrollment.mode`, `GET /api/enrollments/:id/cancel` |
| 3 Dollars | done | virtual `courses.priceDollars`, `discount-codes.{percentValue,amountDollars}` (beforeValidate → cents); commerce money read-only `MoneyDisplay` |
| 4 FR labels | done | discount-codes, courses Stripe fields + slug, sessions Lieu, orders, enrollments |
| Guide | done | §2, §3, §5, §6, §8, §11, À vérifier |

### Deviations / residual risks
- Hook queues only when a staff user saves; seed/scripts without user → warn log, nothing queued.
- In-flight refund (Stripe response lost earlier) → seat skipped without email (avoids duplicates); buyer may miss the notice in that rare case.
- `getSessionView` needs a published course: cancel session before archiving the course (guide says so); otherwise job logs `session_unavailable` and no-ops.
- Waitlisters are expired, not emailed (no template).
- Multi-seat buyer gets one email per seat.
- Staff preview after a refund requested but not yet linked shows "retry"; confirming is de-duplicated (CONFLICT, no second refund).
- Course price cents field hidden (not conditional) so cents validation still runs; discount `value` hidden for the same reason (an admin.condition made the column nullable in the migration diff).
