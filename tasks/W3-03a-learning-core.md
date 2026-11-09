---
type: task
id: W3-03a
status: pending
wave: 3
batch: 3b
module: learning
agent: backend-engineer
model: sonnet
depends-on: [W3-00, W3-07, W3-08]
migration-owner: false
---

# W3-03a — Learning core: course player data, progress, certificates (issue + PDF + verify), materials route

## Mission
Back the online-course experience (CCR-W3-6): an entitled customer gets the course player view, progress persists per lesson, a certificate is issued on completion with a PDF and a public verification lookup, and recipes/PDFs download through an access-checked signed URL. DoD: "Lesson progress persists and a certificate is generated on completion." UI is W3-03b.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.6, §3.7, §4 `@/modules/learning` (CCR-W3-6), catalog (CCR-W3-1), access, notifications (`certificate-issued`), §5.1 learning routes (incl. `/api/materials/:id`, moved to learning by CCR-W3-6)
5. `docs/DISCOVERY.md` §6 F9 (react-pdf, Crockford code), §4 (locale for PDFs) · `docs/DESIGN_SPEC.md` §6 (certificate layout)
6. `apps/web/src/modules/learning/**` (collections), `src/lib/r2.ts` (W3-00)

## Ownership inside learning (parallel with W3-04)
- **Yours:** `learning/index.ts`, `learning/types.ts`, `learning/server/**`, `learning/pdf/**`, `learning/__tests__/**` (except `comments*`), `collections/{lesson-progress,certificates}.ts` (hooks only if needed, no field changes), `src/app/api/{progress,certificates,materials}/**`.
- **W3-04's:** `learning/comments/**`, `collections/comments.ts`, `src/app/api/comments/**`. `learning/index.ts` already contains `export * from "./comments"` (W3-07) — keep it.

## Decisions in force
- Player view (`getCoursePlayer(customerId, slug, locale)`): published online course + active entitlement, else `FORBIDDEN` (no entitlement) / `NOT_FOUND`. Returns course title, ordered lessons (`LessonContent` from catalog — no raw video ids; `hasVideo`, `videoStatus`, `durationSec`), per-lesson `completed`/`positionSec`, `progress { completed, total }`, `certificate?`. Materials listed with id/title/kind/locale only (download via route).
- `recordProgress`: entitlement required (preview lessons do **not** record progress for non-entitled users → `FORBIDDEN`); upsert on UNIQUE `(customer, lesson)` (race-safe — concurrent calls → one row); `positionSec` clamped `0..durationSec` (if known), last write wins (seeking back is allowed); `completed` sticky (true never reverts to false via this API); `completedAt` set once. Course complete ⇔ every lesson of the published course `completed` (course with 0 lessons never completes).
- Certificates: on completion inside `recordProgress` → `issueCertificateIfComplete` **synchronously** (no job slug — CCR-W3-6). Only when `course.certificateEnabled`. Idempotent on UNIQUE `(customer, course)` (race → one row, both callers get it). `verificationCode` 10 chars Crockford base32 from `crypto.randomInt`, retry on unique collision. Snapshots: `customerNameSnapshot` (first + last, fallback email local-part), `courseTitleSnapshot { fr, en }`, `locale` = customer `preferredLocale`. Enqueue `certificate-issued` (idempotencyKey `certificate-<id>`) with absolute localized `downloadUrl` (portal history `#certificates`) and `verifyUrl` (`/certificats/verifier/<code>` · `/certificates/verify/<code>`).
- Q15 default: certificates for **online courses only** in MVP (in-person attendance certificates later).
- PDF (`renderCertificatePdf`): `@react-pdf/renderer` 4.9.0, A4 landscape, built-in PDF fonts only (Times-Roman display / Helvetica body — no runtime font fetch; D4 brand fonts later), localized date (`America/Toronto`, no forced capitalisation), verification code in Courier + verify URL, logo placeholder. All strings from `learning.certificate.*` messages via `getTranslations({ locale })`.
- `verifyCertificate(code)`: normalize (uppercase, strip spaces/hyphens, map `O→0`, `I/L→1`) → `CertificatePublicView { code, customerName, courseTitle {fr,en}, issuedAt }` or null. No email, no ids.
- Routes: `POST /api/progress` (customer, Origin check, 600/customer/h rate limit, zod body) → `{ courseCompleted, certificateId? }`; `GET /api/certificates/:id/pdf?locale=` (owner customer or staff; else 404 — don't reveal existence) → `application/pdf`, `Content-Disposition: attachment; filename="certificat-<code>.pdf"`, `private, no-store`; `GET /api/materials/:id` (customer with active entitlement to **any** course in `getMaterialDownload().courseIds`, or staff) → `302` to `presignR2Get({ key, ttlSeconds: 300, filename })`; else 404.
- Portal summaries for W3-01b: `getCourseProgressSummaries(customerId, locale)`, `listCustomerCertificates(customerId, locale)` (CONTRACT 1.3).

## Acceptance criteria
- [ ] Exports + types per CONTRACT 1.3 `@/modules/learning` (except comment functions — W3-04).
- [ ] Integration (throwaway branch): no entitlement → `FORBIDDEN` for player + progress; revoked → `FORBIDDEN`; progress upsert race (`Promise.all` ×5 same lesson) → 1 row; completing last lesson → `courseCompleted: true`, exactly one certificate + one `send-email` job (`certificate-issued`); concurrent completion of last two lessons → still one certificate; `certificateEnabled: false` → none; completed flag sticky.
- [ ] PDF: renders FR + EN Buffers starting `%PDF-`, size < 200 KB, text extraction (simple regex on uncompressed content stream or react-pdf test renderer) contains name + code; renders in < 2 s locally.
- [ ] Verify: normalization cases, unknown → null, output has no email/ids.
- [ ] Routes: auth matrix tests (owner/other/staff/anon) for PDF + materials; materials 302 `Location` host = R2 endpoint, `X-Amz-Expires=300`; Origin check on progress POST.
- [ ] Coverage ≥ 80 % on `learning/server/**`. typecheck/lint/test green; CI integration not skipped; Vercel preview Ready.

## Files to create / edit
- Create/edit: see "Yours" above; `messages/{fr,en}.json` under `learning.*` (certificate text). Route errors reuse existing `errors.<code>` keys; any new learning-specific message goes under `learning.errors.*` (never edit `errors.*`, W2-04's namespace).

## DO NOT TOUCH
W3-04 paths, catalog/access/notifications internals, collection fields (CCR + stop), `src/app/(frontend)/**`, `package.json`, migrations, `payload-types.ts`.

## Erick handoffs
- None. (D4 brand fonts/logo on the certificate later — placeholder now.)

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-03a -b w3-03a origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W303A_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-03a/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-03a): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

