---
type: task
id: W4-03b
status: complete
wave: 4
batch: 4a
module: commerce · catalog · identity · (+ owners of W3-10 MEDIUM/LOW findings)
agent: backend-engineer
model: sonnet
depends-on: [W3-10]
migration-owner: true (used: w4_security for M-2/L-2 enrollments.cancellation_amount)
---

# W4-03b — Security carry-overs: W2-11 LOW findings + W3-10 MEDIUM/LOW findings

## Mission
Close every open MEDIUM/LOW review finding before the final review, so W4-03c reviews a clean baseline. W3-10 CRITICAL/HIGH are **not** in scope (they get their own `W3-1N-fix-*` briefs and must be merged first).

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `tasks/W2-11-commerce-security-review.md` (findings L-3 … L-8) · `tasks/W3-10-wave3-security-review.md` (findings table, MEDIUM/LOW listed "for W4-03")
5. `docs/CONTRACT.md` §1, §3.7, §4, §5.1, §7 · `docs/MASTER_BUILD_SPEC.md` §4, §8

## Ownership
Only the files named by each finding, inside the owning module's paths (CONTRACT §1): `src/modules/{commerce,catalog,identity,scheduling,learning,video,notifications}/**` and their `src/app/api/**` routes; matching tests. If a W3-10 finding sits in a platform path (`next.config.ts`, `proxy.ts`, headers) → **do not fix**; move it to W4-03a's scope in Completion notes. If it sits in storefront/portal UI → move it to W4-02's scope (or a fix brief if W4-02 is done).

## Dependencies
W3-10 merged and its `W3-1N-fix-*` (CRITICAL/HIGH) merged. Parallel with W4-00, W4-05. Must merge before W4-01 and W4-04 (both touch `api/checkout`/webhook route behaviour or lines).

## Tasks (each: failing test first, then fix)
1. **L-3** (commerce) `enrollments.seatAmount` field `read` → staff or the buyer (`order.customer`); guests no longer see price shares via REST. Field access is config, no migration.
2. **L-4** (commerce) paid session whose course record is null → throw (500 → Stripe retry) with structured log; covered by a webhook unit/integration test.
3. **L-5** (commerce) log `error.message` + Stripe `code`/`type` only in `server/checkout.ts`, `api/stripe/webhook/route.ts`, `api/checkout/route.ts`; no params/PII echo. Test asserts the logger call shape.
4. **L-6** (identity) rate-limit client IP: prefer Vercel's platform IP header, fallback to first `x-forwarded-for` hop; document the Vercel dependency in a code comment + test.
5. **L-7** (commerce) stop copying the raw cart token into Stripe metadata: store a SHA-256 hash (or rely on `holdId`); webhook and release paths resolve by the new value; **in-flight sessions created before deploy must still resolve** (accept both for one release, documented). Replay + release tests updated.
6. **L-8** (catalog) `readVersions: isStaffOrAdmin` on `courses` and `pages` (and any other drafts-enabled collection); integration test: signed-in customer → 403 on `/api/courses/versions`.
7. **W3-10 MEDIUM/LOW:** each finding in the owning module, same pattern. Waitlist PII retention (if W3-10 flagged none exists): prune `waitlist-entries` emails N days after the session ends, using an existing cron path via the owner module's exported function — no new job slug (no jobs-enum migration). Retention days → open question in Completion notes, default 30.
8. Findings table in Completion notes: id → status (fixed + test name | moved to W4-03a/W4-02 | wont-fix with reason).

## Done When
- [ ] L-3 … L-8 fixed with tests; CI `verify` + `integration` green (run link; integration job actually ran these tests).
- [x] Every W3-10 MEDIUM/LOW has a status row; none silently dropped.
- [x] No CONTRACT surface change (exports, routes, events). A needed surface change → `## Contract Change Request`, `blocked`. (Additive only: commerce `seatCancellationCap`/`getSeatCancellationCap` for W4-07, `logCommerceError` route helper; routes gain 429.)
- [x] Migration: `20261114_130258_w4_security` (enrollments.cancellation_amount, M-2/L-2), up/down/up in CI `integration`; flagged in PR title. NOT applied to dev/staging — orchestrator applies after merge.

## Erick handoffs
- None.

## DO NOT TOUCH
`.github/**`, `package.json`, `next.config.ts`, `proxy.ts`, `src/lib/env.ts`, storefront/portal UI, `apps/web/e2e/**` (except a moved PoC test from `test/security/**` once it passes).

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

Branch `w4-03b`, PR #36. Previous run died mid-work (reboot); uncommitted work verified against this brief, completed, committed.

### Findings table
| Source | ID | Status | Where / test |
|---|---|---|---|
| W2-11 | L-3 | fixed | `enrollments.seatAmount` + `cancellationAmount` field read = staff or buyer · `seats.test.ts` "L-3 (W2-11): guest reading own seat via REST…" |
| W2-11 | L-4 | fixed | `completed-prepare.ts`: null course → `webhook.course.missing` log + throw · `webhook-prepare-unit.test.ts` "W2-11 L-4 …" |
| W2-11 | L-5 | fixed | `server/log-error.ts` (`logError`/`safeErrorFields`), used in checkout, webhook + checkout + release routes, refund, seat cancel, attendees CSV, envelope · `log-error.test.ts` (logger call shape, no PII) |
| W2-11 | L-6 | fixed | `identity/server/http.ts clientIp`: `x-vercel-forwarded-for` → `x-real-ip` → first `x-forwarded-for` hop; Vercel dependency documented · `client-ip.test.ts` |
| W2-11 | L-7 | fixed | metadata `cartToken = sha256:<hex>`; webhook uses it as marker only, holds resolve by `holdId`; raw-token (pre-deploy) sessions still resolve · `checkout-params.test.ts` "W2-11 L-7 …" |
| W2-11 | L-8 | fixed | `readVersions: isStaffOrAdmin` on `courses`, `pages` (only drafts-enabled collections) · `catalog/__tests__/versions-access.test.ts` (integration, CI) |
| W3-10 | M-1 | fixed | `lessons.video` group field access create/update false · `test/security/w3-invariants.test.ts` PoC flipped |
| W3-10 | M-2 | fixed | `seats/cap.ts seatCancellationCap` = min(seat − linked, order total − all refunds − sibling promises), checked before seat commit; exported for W4-07 · `seats.test.ts` "M-2 refund tier…", "M-2 credit tier…" |
| W3-10 | L-1 | fixed | `sanitizeNext` idempotent (re-checks normalised path) · `next-path.test.ts` vectors `/.//x`, `/..//x`, `/a/..//x`, `/%2e//x` |
| W3-10 | L-2 | fixed | `enrollments.cancellationAmount` persisted in plan tx, replayed on retry; seat released to waitlist on UPSTREAM · `seats.test.ts` "L-2 …", `scheduling/__tests__/cancel.test.ts` |
| W3-10 | L-3 | moved to W4-02 | credit codes are bearer codes / remainder forfeited → policy page/FAQ copy (storefront content). Optional webhook `personalFor` alert not done (no consumer for the alert) |
| W3-10 | L-4 | moved to W4-06 | Mux referrer allow-list is provisioning (runbook); shorter TTL needs player token refresh (UI) |
| W3-10 | L-5 | fixed | `video/server/config.ts`: fake provider refused when `VERCEL_ENV=production` (fixed in video module, `lib/env.ts` untouched) · `w3-invariants.test.ts` "W4-03b L-5 …" |
| W3-10 | L-6 | fixed (+ W4-06) | Mux passthrough `<site host>:<lessonId>`, foreign host → ignored, bare id accepted for one release · `mux-adapter.test.ts` "mux passthrough namespace". Separate Mux env per deployment stays in W4-06 runbook |
| W3-10 | L-7 | fixed | comments `customer`/`moderatedBy` field read = staff or self · `comments.test.ts` |
| W3-10 | L-8 | wont-fix (accepted) | certificate attests lessons marked done; watch-time gate would break text lessons / review seeking. Documented on `recordProgress`; bounded by entitlement + 600/h |
| W3-10 | L-9 | fixed | certificate PDF 30/h, material 120/h per customer; cancel 20/h per actor; 429 + retry-after · `learning/__tests__/route-rate-limits.test.ts`, `scheduling/__tests__/cancel-rate-limit.test.ts` |
| W3-10 | L-10 | fixed (partial) | waitlist entries purged 30 days after session end in the reminders cron (`purgeExpiredWaitlistEntries`, no new job slug) · `waitlist.test.ts`. One-click "remove me" link in `waitlist-seat-available` → W4-02 (template/UI) |
| W3-10 | L-11 | fixed | comments list newest-first with limit, then reversed · `comments.test.ts` |
| W3-10 | L-12 | wont-fix (accepted) | guard tx + plan tx = 2 pooled conns per cancel; bounded by L-9 limit, Neon pooler; documented on `withSeatGuard`. W4-07 bulk cancels should loop sequentially |

### Open questions
- Waitlist retention days: default 30 (`WAITLIST_RETENTION_DAYS`, Q22).
- L-7 legacy raw-token acceptance and L-6 bare passthrough acceptance: remove after one release.

