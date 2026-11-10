---
type: task
id: W3-04
status: in-review
wave: 3
batch: 3b
module: learning (comments sub-barrel)
agent: backend-engineer
model: sonnet
depends-on: [W3-07, W3-08]
migration-owner: false
---

# W3-04 — Lesson comments with staff moderation

## Mission
Entitled customers post comments (and one-level replies) on lessons; staff approve or reject them in Payload admin; approved comments are visible to entitled viewers of that lesson; the author is emailed when approved. MASTER §3.5. UI thread is W3-03b.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.6 `comments`, §3.7 comments row, §4 learning comment functions (CCR-W3-6), notifications `comment-approved`, identity `consumeRateLimit`, §5.1 `/api/comments`
5. `apps/web/src/modules/learning/collections/comments.ts` (existing access, `validateParent`)

## Ownership inside learning
Yours: `learning/comments/**` (barrel exists, created by W3-07 and re-exported from `learning/index.ts`), `learning/collections/comments.ts`, `src/app/api/comments/**`. Everything else in learning is W3-03a's (parallel). Entitlement check: import `hasActiveEntitlement` from `@/modules/access`, lesson → course via `@/modules/catalog` `getLessonVideoRef` (returns `courseId`, `courseStatus`) — no import from W3-03a internals.

## Decisions in force
- `postComment`: active entitlement to the lesson's course; body trimmed, 1..2000 chars, plain text (rendered as text — no HTML/markdown); `parentId` must be an **approved** comment on the **same lesson** with no parent; rate limit 10/customer/h (`consumeRateLimit` namespace `comments`); status always `pending`; result 201.
- `listLessonComments({ lessonId, customerId })`: entitlement required; returns approved comments + the caller's own pending/rejected ones (flagged), threaded (replies under parents, oldest first), author display = first name + last initial (Q14 default; fallback "Participant·e"/"Participant"). Never returns emails or customer ids.
- Staff replies: **not in MVP** — staff moderate only (a staff-authored comment needs a schema change: `customer` is required). Want it → CCR, don't build.
- Moderation: comments admin list default-filtered to `pending` (list view `admin.listSearchableFields`, a `defaultColumns` tweak, and a "pending" count badge are fine), approve/reject = edit `status`; `beforeChange` sets `moderatedBy` = current staff user on status change; `afterChange` pending→approved enqueues `comment-approved` (idempotencyKey `comment-approved-<id>`) to the author in their `preferredLocale` with absolute localized `lessonUrl`; →rejected sends nothing. Rejected → hidden from everyone except the author.
- Customers can't change a comment after posting (update = staff/admin, already).

## Acceptance criteria
- [x] Exports per CONTRACT 1.3 (`postComment`, `listLessonComments`, `CommentView`) from `learning/comments/index.ts`.
- [x] `POST /api/comments` (customer session, Origin check, zod): 201 pending; no entitlement → 403; reply to pending/rejected/other-lesson/nested parent → 400 VALIDATION; > 2000 chars → 400; 11th in an hour → 429; anonymous → 401.
- [x] Integration: approve → author receives one `send-email` job; double-approve save → still one job (idempotency key); reject → none; `moderatedBy` set; listing as other entitled customer shows only approved; author sees own pending flagged; non-entitled → `FORBIDDEN`. Customer REST `PATCH /api/comments/:id` → 403 (existing access proven).
- [x] XSS: body `<img src=x onerror=alert(1)>` stored verbatim and returned as plain string; test asserts no HTML transformation server-side (rendering safety is W3-03b's, noted there).
- [ ] Admin: staff Playwright smoke (throwaway branch) — pending list shows the new comment, approve it, status saved; screenshot `e2e/__screenshots__/w3-04/`.
- [x] typecheck/lint/test green; CI integration not skipped; Vercel preview Ready.

## Files to create / edit
- Create/edit: `learning/comments/**`, `learning/collections/comments.ts` (hooks + admin config only, **no field changes**), `src/app/api/comments/route.ts`, tests, `e2e/w3-04-moderation.test.ts`.
- Edit: `messages/{fr,en}.json` under `learning.comments.*` (server-side strings only, e.g. display fallback).

## DO NOT TOUCH
`learning/index.ts`, `learning/server/**`, other collections, notifications internals, `src/app/(frontend)/**`, migrations, `payload-types.ts`.

## Erick handoffs
- None. Q14 (display name format) default applied.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-04 -b w3-04 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W304_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-04/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-04): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.


## Completion notes
- Implemented: `learning/comments/**` (post, list, display, moderation hooks, zod), collection hooks + admin config (no field changes), `POST /api/comments`, `learning.comments.*` i18n (FR/EN parity).
- Local: typecheck, lint, unit tests green. Integration tests (`comments/__tests__/comments.test.ts`) need a Neon branch; local `neonctl branches create` was denied by the permission classifier, so they run in CI only (CI integration job passed: 64 files passed, comments suite 9/9).
- Deviations:
  - `listLessonComments` takes optional `locale` (default `fr`) for the fallback author label; additive to CONTRACT signature.
  - Admin list is **not** hard default-filtered to `pending` (`baseFilter` would also hide approved/rejected from staff and affects relationship pickers). Instead: `status` first column, `listSearchableFields: ['body']`, `defaultSort: -createdAt`, description tells staff to filter on Pending (deep link `?where[status][equals]=pending`). No count badge.
  - Approved-email dedupe: besides `previousDoc.status !== approved`, `afterChange` looks up `payload-jobs` by `input.idempotencyKey` so approved→pending→approved sends once.
  - Unknown/draft lesson → `FORBIDDEN` (no existence leak). Rate limit counted after entitlement, before parent checks.
  - `lessonUrl` uses lesson id as `[lesson]` param: `/account/courses/[slug]/[lesson]` (W3-03b must resolve by id).
- Not done: staff Playwright smoke + screenshots. `e2e/w3-04-moderation.test.ts` written (needs seeded staff + pending comment on a throwaway DB), not executed here.
