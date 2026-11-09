---
type: task
id: W3-11
status: pending
wave: 3
batch: 3d
module: quality
agent: e2e-runner
model: sonnet
depends-on: [W3-01, W3-01b, W3-02, W3-03a, W3-03b, W3-04, W3-05, W3-06]
migration-owner: false
---

# W3-11 — Wave 3 acceptance on staging: online purchase → magic link → player → certificate; seat cancellation; reminders; waitlist

## Mission
Prove on the real staging deployment (Stripe test mode, fake or Mux video) the Wave 3 DoD items: buy an online course, log in with a magic link, see only entitled courses, progress persists, certificate generated and verifiable, video not playable outside an entitled session; plus in-person ops: per-seat cancellation by policy, reminders with `.ics` to buyer + guests, waitlist notification, attendance.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan + all W3 PR notes) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §9 (items 3, 4, 5, 7), §11 · `docs/CONTRACT.md` 1.3 §5, §6
5. `tasks/W2-12-wave2-acceptance-staging.md` (fixture + bypass-header patterns), `apps/web/test/staging-fixtures.ts`, `infra/cron-worker/README.md`

## Preconditions (check first; missing → use the workaround, record it)
- Wave 3 migration applied to staging (orchestrator) — probe: fixture script reads `reminder-deliveries` count without error. Missing → `status: blocked` (no workaround).
- `VIDEO_PROVIDER` on staging: `mux` (keys present) or `fake` + `VIDEO_FAKE_ALLOWED=true`. Neither → video criteria "not testable (D2)", continue.
- Stripe webhook + cron worker from Wave 2 (W2-12 preconditions). Cron missing → call `/api/cron/{jobs,reminders}` manually via `vercel curl` and mark "manual cron".
- Magic-link email on staging: Resend test domain delivers only to the account owner (D8). Workaround: fixture script mints a magic-link token via the identity Local API on the staging DB (test-only helper in `apps/web/test/`, never shipped) **or** reads `W2_TEST_EMAIL` inbox via Resend API if delivered — record which.
- Vercel bypass secret via `vercel api /v9/projects/cook-for-friends` (never printed/committed).

## Acceptance criteria
- [ ] Fixtures (idempotent, `[TEST]` prefixed): online course with 3 lessons (one with a material PDF, video assets set via fake/Mux upload), `certificateEnabled: true`, synced to Stripe; in-person course with sessions at now+100 h (capacity 4), now+47 h (capacity 4), now+30 h (capacity 1 → waitlist).
- [ ] **Online DoD (FR):** buy the online course (Playwright, card 4242) as `W2_TEST_EMAIL` → magic link → `/fr/compte` shows **exactly** that course; a second customer with no entitlement gets 403 on its player and 403 from `/api/video/playback`; signed-out playback → 401; complete all lessons → certificate issued, PDF downloads (200 `application/pdf`), `/fr/certificats/verifier/<code>` shows name + course; `certificate-issued` job sent.
- [ ] Progress persists across logout/login (positionSec + completed).
- [ ] **Cancellation:** 3-seat purchase on the +100 h session → buyer cancels guest seat → Stripe partial refund = that `seatAmount`, order `partially_refunded`, enrollment `refunded` after webhook, guest entitlement revoked, buyer + guest emails; on the +47 h session cancel → credit code created + synced (`stripePromotionCodeId` set) + emailed; guest cannot cancel (UI + API 403/404).
- [ ] **Reminders:** after one `/api/cron/reminders` run: buyer + guests of the +47 h session get the 48 h reminder with `.ics` (jobs + Resend status; plus-addressed delivery caveat D8 recorded per message); second run sends nothing new.
- [ ] **Waitlist:** fill the capacity-1 session, join waitlist with 2 emails, cancel the seat → first entries `notified`, `waitlist-seat-available` jobs enqueued.
- [ ] **Attendance:** staff marks present/absent in the session admin panel; CSV reflects nothing new (no column) but enrollment `attendance` updated.
- [ ] **EN smoke:** `/en/account`, player, verify page in English.
- [ ] **SEO/PWA:** `/sitemap.xml`, `/robots.txt` (staging noindex), `/manifest.webmanifest` 200; after visiting `/fr/compte`, SW caches contain no account/api entries.
- [ ] Results table (criterion → evidence ids/timestamps/run links) in this file; no secrets. Cleanup: temp staff user deleted, `[TEST]` courses archived.

## Files to create / edit
- Create: `apps/web/e2e/w3-11-*.test.ts`, `apps/web/test/staging-fixtures-w3.ts`. Edit: this file.

## DO NOT TOUCH
`apps/web/src/**`, `infra/**`, `playwright.config.ts`, Neon `production`, Stripe live mode. Product bug → `tasks/W3-1N-fix-<slug>.md` (owner per CONTRACT §1), `status: blocked`, exit.

## Erick handoffs (consolidated)
1. D2 Mux keys (W3-02) — workaround fake provider.
2. Staging env: `VIDEO_PROVIDER`, `VIDEO_FAKE_ALLOWED` set in Vercel (W3-00) — workaround: video criteria "not testable".
3. Cron worker hourly reminders — workaround manual `vercel curl`.

## Done when
Every criterion has evidence or a named D2/D8 deferral, cleanup done, PR open with results, `status: complete` → Erick reviews the Wave 3 gate.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-11 -b w3-11 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W311_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-11/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-11): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

