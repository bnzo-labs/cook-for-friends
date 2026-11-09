---
type: task
id: W3-01b
status: pending
wave: 3
batch: 3c
module: portal + storefront (waitlist CTA)
agent: frontend-architect
model: sonnet
depends-on: [W3-01, W3-03a, W3-05]
migration-owner: false
---

# W3-01b — Portal ops UI: seat cancellation, certificates + progress in portal, storefront waitlist

## Mission
Wire the Wave 3 operations into the UI: a buyer cancels a seat from "Mes séances" seeing exactly what the policy gives back; history shows certificates; the dashboard shows course progress with "continue"; full sessions on the storefront offer "Liste d'attente / Join waitlist".

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §4 scheduling (`previewCancellation`, `cancelEnrollment` route), learning (`getCourseProgressSummaries`, `listCustomerCertificates`), §5.1 `/api/enrollments/:id/cancel`, `/api/waitlist`
5. `docs/DESIGN_SPEC.md` §3 (`SeatBadge` full → waitlist CTA, `CertificateCard`, `Dialog`), §4 ("Sold out: never hide a session")
6. W3-01 PR (slots `data-cancel-slot`, `#certificates`), W3-05 PR notes, `src/components/storefront/SessionList.tsx` (W2-06/W2-10)

## Decisions in force
- Cancel: on each upcoming confirmed row where `bookedByMe` (buyer), a "Annuler cette place / Cancel this seat" button opens a dialog rendering the server-computed `previewCancellation` (outcome, amount fr-CA/en-CA, percent, hours left, link to the cancellation policy page from `site-settings.legal.cancellationPage` when set). Confirm → `POST /api/enrollments/:id/cancel`; success → row updates to cancelled + toast with outcome (credit code is **not** shown in UI — it is emailed; say so); `CONFLICT` (already cancelled / too late) and `UPSTREAM` ("refund is being processed, try again") mapped to messages; double-submit prevented. `allowed: false` → button replaced by the reason (e.g. guest seat: "Contact <buyer first name> who booked this seat" — buyer first name only; past deadline; self-cancel disabled → "Contact us" with `contactEmail`).
- Guest viewing own seat: no cancel button (Q11).
- History `#certificates`: `CertificateCard` per `listCustomerCertificates` (course, date, code in mono, download link to `/api/certificates/:id/pdf?locale=`).
- Dashboard: online course cards gain a progress bar (`completedLessons/totalLessons`, `aria-valuenow`) and "Continuer / Continue" → next incomplete lesson; completed → "Terminé" badge + certificate link.
- Storefront waitlist (MASTER §3.4, DESIGN_SPEC §4): `SessionList` full sessions (from W2-10 availability) render a "Liste d'attente / Join waitlist" button opening an inline form (email, required, prefilled if a customer session exists — server-side read only) → `POST /api/waitlist` → always the same confirmation "We'll email you if a seat frees up — first to book gets it." (D10; no reservation). Hidden for sessions that started. Course page caching: keep W2-10's split (dynamic availability block only).

## Acceptance criteria
- [ ] e2e `e2e/w3-01b-ops.test.ts` (throwaway branch seed, Stripe at test port or test-mode keys from `.env.local`; email via test transport): buyer with 3 seats at ≥ 72 h → dialog shows refund 100 % of `seatAmount`, confirm → row cancelled, API called once; at 48 h → credit wording; < 24 h → "no refund" wording, still cancellable; guest login sees own seat with no button + buyer-name hint; `customerCanSelfCancel=false` → contact message.
- [ ] Certificates list + download (200 `application/pdf`), dashboard progress values match `getCourseProgressSummaries`.
- [ ] Waitlist: full session shows CTA (seed capacity-1 session filled), submit → confirmation, DB row exists; same email again → same confirmation, still one row; FR + EN.
- [ ] axe 0 serious/critical at 320 + 1440 FR + EN on sessions (dialog open), history, dashboard, course detail with waitlist form; dialog focus trap + return focus; screenshots `e2e/__screenshots__/w3-01b/`.
- [ ] typecheck/lint/test green; CI green; Vercel preview Ready.

## Files to create / edit
- Edit/create: `src/app/(frontend)/[locale]/account/{page,sessions,history}/**` (W3-01's files — this task is their single writer in 3c), `src/components/portal/{sessions,history,dashboard}/**`, `src/components/storefront/SessionList*` (waitlist CTA mount only), `src/components/storefront/waitlist/**`, e2e.
- Edit: `messages/{fr,en}.json` under `portal.sessions.cancel.*`, `portal.history.certificates.*`, `portal.dashboard.progress.*`, `storefront.waitlist.*`.

## DO NOT TOUCH
`account/courses/**` + `components/portal/{player,comments}/**` (W3-03b, parallel), `src/modules/**`, `src/app/api/**`, `components/storefront/booking/**` (unless the waitlist mount strictly requires a prop — then minimal), `src/styles/**`, `src/components/{ui,layout}/**`.

## Erick handoffs
- D1 tiers + `legal.cancellationPage` content (client). Workaround: default tiers; policy link hidden when the page is unset.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-01b -b w3-01b origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W301B_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-01b/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-01b): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

