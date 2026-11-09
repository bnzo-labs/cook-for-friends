---
type: task
id: W3-03b
status: pending
wave: 3
batch: 3c
module: portal (player) + storefront (certificate verify page)
agent: frontend-architect
model: sonnet
depends-on: [W3-01, W3-02, W3-03a, W3-04]
migration-owner: false
---

# W3-03b — Learning UI: course player, video, progress, materials, comments thread, certificate verify page

## Mission
The online course experience in the portal: lesson list with progress, protected video that refreshes its signed URL, lesson text and downloads, progress saving, comments thread with posting, a certificate download when complete, and the public certificate verification page. DoD: "buys an online course, logs in with a magic link and sees only the courses they are entitled to" + "Videos cannot be played outside an authenticated, entitled session."

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §4 learning (`getCoursePlayer`, `listLessonComments`, types), video (playback route + `posterUrl`/`expiresAt`), §5.1 progress/comments/materials/certificates/video routes, §5.2
5. `docs/DESIGN_SPEC.md` §3 (`LessonList`, `VideoPlayer`, `CertificateCard`), §5 (focus to lesson title on route change, captions)
6. W3-01 portal layout + components, W3-02/W3-03a/W3-04 PR notes

## Decisions in force
- Pages: `/account/courses/[slug]` (course overview → redirects to first incomplete lesson or shows overview + "Commencer/Continuer") and `/account/courses/[slug]/[lesson]` (lesson id in URL; slug is the **localized** course slug — switching locale maps via `getPublishedCourse`). Server components call `learning.getCoursePlayer`; `FORBIDDEN` → localized 403 page with CTA to the course's storefront page; `NOT_FOUND` → 404. `force-dynamic`, `private, no-store`.
- `VideoPlayer` (client): fetches `/api/video/playback?lessonId=` on mount, re-fetches 60 s before `expiresAt` and on playback error 403; Mux → `@mux/mux-player-react` 3.14.1 fed from the playback response (`src` = URL, or parse playbackId + `token` into `playbackId`/`tokens.playback` — whichever 3.14.1 supports cleanly) + poster, lazy-loaded (`next/dynamic`, no SSR) so its JS never ships on pages without video; `fake` provider → a token-styled placeholder panel stating the lesson video (aria-live) — used by e2e. 401/403/503 → localized error state, no retry storm (max 3 retries with backoff). Captions shown when present.
- Progress: post `positionSec` every 15 s while playing + on pause/ended (`navigator.sendBeacon` fallback on `pagehide`), mark complete on `ended` or via "Marquer comme terminée / Mark as complete" button (lessons without video use the button). Optimistic UI with rollback + toast on error. `courseCompleted: true` → celebratory but quiet banner with certificate download link (`/api/certificates/:id/pdf?locale=`).
- Lesson body: Lexical rendered with the existing storefront `LexicalRenderer` (import, don't fork). Materials: list with kind icon, file language badge, link to `/api/materials/:id` (download attribute). 
- Comments: thread under the lesson via `listLessonComments` (server), form posting to `/api/comments` (client), own pending comment shown with "en attente de modération / awaiting moderation"; replies one level; body rendered as **plain text** (React text node, `white-space: pre-wrap`) — never `dangerouslySetInnerHTML`; 429/403/400 mapped to messages.
- Focus moves to the lesson `h1` on lesson change (DESIGN_SPEC §5). `LessonList` is a nav with `aria-current="page"`.
- Certificate verify page `/certificats/verifier/[code]` · `/certificates/verify/[code]` (storefront path, public, `noindex`): valid → name, course title (current locale), issue date; invalid → neutral "no certificate matches this code" (200, not 404 — avoids oracle differences in status). Rate-limit not needed (50-bit codes).

## Acceptance criteria
- [ ] Player pages + verify page render FR + EN; non-entitled customer → 403 page and **no playback request succeeds** (e2e asserts the playback API returns 403 and no `<mux-player>`/placeholder with a URL is present); signed-out → login redirect.
- [ ] e2e (`e2e/w3-03b-player.test.ts`, PW_CHANNEL=chrome, fake video provider, throwaway branch seed: online course with 3 lessons, one with materials, one entitled customer + one non-entitled): open course → lesson 1, placeholder video panel present, progress persists across reload, complete all 3 → banner + PDF download returns `application/pdf`; material link returns 302 to an R2 presigned URL (assert `Location` host only — don't follow); post a comment → shown pending; staff approves via Local API in the test → visible to the other entitled customer; comment body with `<img onerror>` renders as text.
- [ ] Playback URL refresh unit test (fake timers): refetch before expiry, backoff on 403, stop after 3.
- [ ] Mux player JS absent from the account dashboard bundle (assert via build output or `page.on('request')` no `mux-player` chunk on `/account`).
- [ ] axe 0 serious/critical at 320 + 1440 FR + EN on player + verify pages; keyboard-only: lesson nav, complete button, comment form; screenshots `e2e/__screenshots__/w3-03b/`.
- [ ] typecheck/lint/test green; CI green; Vercel preview Ready. Staging probe for PR body: `/fr/certificats/verifier/AAAAAAAAAA` → 200 "no match".

## Files to create / edit
- Create: `src/app/(frontend)/[locale]/account/courses/**`, `src/components/portal/{player,comments}/**`, `src/app/(frontend)/[locale]/(site)/certificates/verify/[code]/page.tsx`, `src/components/storefront/certificate/**`, e2e + unit tests.
- Edit: `messages/{fr,en}.json` under `portal.player.*`, `portal.comments.*`, `storefront.certificate.*`.

## DO NOT TOUCH
Other `account/**` pages + `components/portal/**` outside player/comments (W3-01/W3-01b), `src/modules/**`, `src/app/api/**`, `src/components/{ui,layout}/**`, `src/styles/**`, `package.json`.

## Erick handoffs
- D2: real video playback needs Mux keys (W3-02 handoff). Workaround: fake provider placeholder; Mux path covered by W3-02 unit tests + optional live smoke.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-03b -b w3-03b origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W303B_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-03b/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-03b): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

