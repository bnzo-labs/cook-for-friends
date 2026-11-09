---
type: task
id: W3-07
status: pending
wave: 3
batch: 3a
module: catalog, identity, scheduling (schema), learning (barrel)
agent: backend-engineer
model: sonnet
schema-review: opus (orchestrator, before merge)
depends-on: [PR-12 hardening-dev-push]
migration-owner: true   # ONLY migration of Wave 3 (slot 3a)
---

# W3-07 — Wave 3 schema + catalog/identity seams (migration owner 3a)

## Mission
Land **all Wave 3 schema in one migration** and the new read/write seams other Wave 3 tasks consume: lesson video state fields, the scheduling `reminder-deliveries` collection, catalog functions (CCR-W3-1), identity profile update + localized magic-link URL (CCR-W3-2), and the empty `learning/comments` sub-barrel. Every 3b/3c task depends on this. Same role W2-02b played in Wave 2.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.1 (`lessons`), §3.5 (`reminder-deliveries`), §3.7, §4 catalog (CCR-W3-1), identity (CCR-W3-2), §7
5. `apps/web/src/modules/catalog/**` (pattern: `server/stripe-sync-record.ts` for context-guarded writes, `server/mappers.ts`, `types.ts`), `modules/identity/server/{magic-link,session}.ts`, `modules/scheduling/**`, `modules/learning/index.ts`
6. `docs/DISCOVERY.md` §5 (video fields), §4 (pathnames)
7. Migration precedent: `src/migrations/20261020_004708_w2_multi_seat_course_status.ts`

## Scope — schema (one migration `<ts>_w3_schema`)
- `lessons.video`: `provider` options + `fake`; new `uploadId` (text, admin readOnly), `status` select `none|preparing|ready|errored` default `none` (admin readOnly). Existing `assetId`, `playbackId`, `durationSec` unchanged. Field-level access: staff/admin only (lessons already staff-only).
- New collection `reminder-deliveries` in **scheduling** (`modules/scheduling/collections/reminder-deliveries.ts`, added to `schedulingCollections`): `enrollment → enrollments` (required), `offsetHours` int ≥ 1, `sentAt` date, `jobId?` text. **UNIQUE `(enrollment, offsetHours)`**. Access: create/update/delete denied (Local API `overrideAccess` only), read staff. Admin hidden.
- No other schema. No job task slugs (Wave 3 sends email via the existing `send-email` job — CCR-W3-5/6 drop `waitlist-notify` and `issue-certificate` slugs).

## Scope — seams (signatures binding, CONTRACT 1.3 §4)
- **catalog (CCR-W3-1):** `listCoursesByIds`, `getCourseLessonsContent`, `getLessonVideoRef`, `recordLessonVideo`, `getMaterialDownload`, `listSessionsStartingBetween` + types `LessonContent`, `LessonVideoRef`, `LessonVideoPatch`, `MaterialDownload`. Published courses only for customer-facing reads (`listCoursesByIds`, `getCourseLessonsContent`); `getLessonVideoRef` returns the ref regardless of course status but includes `courseStatus`. `recordLessonVideo` writes only `lessons.video.*` with `context: { skipStripeSync: true }` analogue — no draft publishing, no other field. `getMaterialDownload` resolves `courseIds` = courses whose `materials[]` contain it **or** whose lessons' `materials[]` contain it; `storageKey` = the media doc's R2 key (respect `prefix` if set) — no URLs.
- **identity (CCR-W3-2):** `updateCustomerProfile(customerId, patch: { firstName?, lastName?, phone?, preferredLocale?, marketingConsent?, dietaryNotes? })` → `Result<CustomerView>` (zod: names ≤ 100, phone ≤ 30, dietaryNotes ≤ 500, locale ∈ locales; email never changes). Magic-link email URL built with next-intl `getPathname({ locale, href: '/auth/verify' })` → FR `/fr/connexion/verifier?token=…`, EN `/en/auth/verify?token=…` (today it hard-codes `/auth/verify`, which is not the FR public path). Same for `next` default `/account` → localized.
- **learning:** create empty `modules/learning/comments/index.ts` (comment header only) and `export * from "./comments"` in `learning/index.ts` — so W3-03a (owns `learning/index.ts` + `server/**`) and W3-04 (owns `learning/comments/**`) run in parallel without touching the same file. Nothing else in learning.

## Acceptance criteria
- [ ] Migration `<ts>_w3_schema` generated **after** PR #12 is on `main` (rebase first), committed with working `down()`; up/down/up verified on a throwaway branch; `payload-types.ts` regenerated; `migrations/index.ts` updated. Snapshot chain: `…_w2_jobs_stripe_sync` → `w3_schema`.
- [ ] Integration tests (throwaway branch): `reminder-deliveries` duplicate `(enrollment, offsetHours)` rejected; concurrent 5× insert same key → exactly 1 row; lessons with `video.provider: 'fake'` + `status` round-trip; customer cannot read/create `reminder-deliveries` via REST (403/empty).
- [ ] Catalog tests: `listCoursesByIds` preserves input order, drops drafts/archived/unknown, locale fallback flag; `getCourseLessonsContent` ordered by `order`, body + materials (id, title, kind, locale) + video summary **without** `assetId`/`playbackId` (players never see raw ids); `getLessonVideoRef` returns ids; `recordLessonVideo` changes only video fields (title/body untouched, no new version published); `getMaterialDownload` courseIds via course and via lesson; `listSessionsStartingBetween` returns `scheduled` only, `[from, to)` boundaries.
- [ ] Identity tests: profile update validation errors → `VALIDATION` with paths; email unchanged; `sessionVersion` unchanged. Magic-link URL test for FR + EN asserts localized path; existing identity tests green.
- [ ] `pnpm typecheck`, `lint`, `test` green; CI integration job ran (not skipped). Vercel preview Ready.
- [ ] PR body lists the migration name + "orchestrator: apply to Neon dev then staging after merge".

## Files to create / edit
- Edit: `modules/catalog/collections/lessons.ts`, `modules/catalog/{index,types}.ts`, create `modules/catalog/server/{lessons,materials,sessions-window}.ts` (or extend `sessions.ts`), tests under `modules/catalog/__tests__/`.
- Edit: `modules/identity/{index,types}.ts`, `modules/identity/server/{magic-link,profile}.ts` (create `profile.ts`), tests.
- Create: `modules/scheduling/collections/reminder-deliveries.ts`; edit `modules/scheduling/index.ts` (collections array only).
- Create: `modules/learning/comments/index.ts`; edit `modules/learning/index.ts` (one re-export line).
- Create: `src/migrations/<ts>_w3_schema.{ts,json}`; edit `src/migrations/index.ts`, `src/payload-types.ts` (regenerated). **Only Wave 3 migration.**

## DO NOT TOUCH
`commerce/**`, `notifications/**`, `video/**`, `access/**`, other learning files, `scheduling/server/**`, `src/app/**`, `payload.config.ts`, `package.json`, `messages/**` (no customer copy here; admin labels inline FR/EN like existing collections).

## Erick handoffs
- None. (Orchestrator applies the migration to `dev` + `staging` after merge.)

## Done when
Criteria ticked, PR open, CI green, Opus schema review requested in PR body, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-07 -b w3-07 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W307_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-07/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-07): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

