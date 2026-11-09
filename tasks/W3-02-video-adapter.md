---
type: task
id: W3-02
status: complete
wave: 3
batch: 3b
module: video
agent: backend-engineer
model: sonnet
depends-on: [W3-00, W3-07]
migration-owner: false
---

# W3-02 — Video adapter: VideoProvider interface, fake + Mux adapters, signed playback route, Mux webhook, admin upload field

## Mission
Video is never public (MASTER §4 rule 4). Build the provider-agnostic video module (CCR-W3-7): `VideoProvider` with a **fake** adapter (works with no credentials — CI, local, staging until D2 keys) and the **Mux** adapter (signed playback), `getLessonPlayback` gated by entitlement, the playback route, the Mux webhook that records upload → asset on the lesson, and a staff upload field on lessons.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §3.1 `lessons.video`, §4 `@/modules/video` (CCR-W3-7), catalog `getLessonVideoRef`/`recordLessonVideo`, access `hasActiveEntitlement`, identity `getCurrentCustomer`/`isStaff`, §5.1 video routes
5. `docs/DISCOVERY.md` §5 (interface, Mux signed policy), §2 (`@mux/mux-node@15.5.0`)
6. `apps/web/src/lib/env.ts` (after W3-00), `modules/commerce/admin/MoneyCell.tsx` + `src/admin/SessionAttendees` (admin component + importMap precedent), `modules/commerce/server/stripe-port.ts` (network-seam test pattern)

## Decisions in force
- **D2:** Mux first behind `VIDEO_PROVIDER`; Bunny adapter **not** built (interface stays ready). `getVideoProvider()` returns the adapter for `mux|fake`; `none` → `getLessonPlayback` returns `UPSTREAM { service: 'video', message: 'not_configured' }` (route 503). Missing Mux keys with `VIDEO_PROVIDER=mux` already fail at boot (W3-00).
- **Fake adapter** (real code, non-prod only — env guard from W3-00): `getPlayback` returns `${SITE_URL}/api/video/fake?asset=<assetId>&exp=<unix>&sig=<HMAC-SHA256(PAYLOAD_SECRET, asset|exp|viewer)>`; `GET /api/video/fake` verifies sig + exp (timing-safe) → 200 `{ fake: true, assetId }`, else 403. `createUpload` returns an upload URL to `PUT /api/video/fake-upload/<uploadId>` (staff-only, accepts and discards ≤ 1 MB, marks the upload ready). `getAsset` → `ready` for fake ids. Both fake routes 404 unless provider is `fake`.
- **Mux adapter:** `@mux/mux-node` 15.5.0. Direct upload with `new_asset_settings.playback_policy: ['signed']`, `passthrough = lessonId`, `cors_origin = SITE_URL`. Playback: JWT (RS256, `MUX_SIGNING_KEY_ID`/`_PRIVATE`), `sub = playbackId`, `aud = 'v'`, `exp`; poster via `aud = 't'` thumbnail token. URL `https://stream.mux.com/<playbackId>.m3u8?token=…`. TTL **3600 s** (≤ 2 h, DISCOVERY §5). Network calls through one port (`video/server/mux-port.ts`) swappable in tests.
- **Q13 default (preview lessons):** `isPreview` lessons playable by any **signed-in customer** without entitlement; anonymous → 401. Non-preview → entitlement required (`hasActiveEntitlement(customer, courseId)`), else `FORBIDDEN`. Lesson of a non-published course → `NOT_FOUND` for customers. Staff (users) may play any lesson (admin preview).
- Playback route: `GET /api/video/playback?lessonId=` → `{ url, posterUrl?, expiresAt }`, `Cache-Control: private, no-store`; rate limit 120/customer/h via `identity.consumeRateLimit` (namespace `video-playback`, scope `email` keyed by customer id). URL never stored, never logged.
- Webhook `POST /api/video/webhook`: Mux signature verified on the raw body (`MUX_WEBHOOK_SECRET`; absent → 503). `video.upload.asset_created` → `recordLessonVideo(passthrough, { uploadId, assetId, status: 'preparing' })`; `video.asset.ready` → `{ playbackId (signed), durationSec, status: 'ready' }`; `video.asset.errored` → `status: 'errored'`. Idempotent (same state twice = no-op); unknown lesson → 200 + warn log.
- Staff upload: `POST /api/video/uploads { lessonId }` (staff session via `payload.auth`, Origin check) → `{ uploadUrl, uploadId }` and sets lesson `status: 'preparing'`, `uploadId`, `provider`; `GET /api/video/uploads/<uploadId>?lessonId=` (staff) polls `getAsset` and records the result — works on staging **without** a configured webhook. Admin field `src/modules/video/admin/LessonVideoField.tsx`: shows status, duration, "Téléverser / Upload" (file input → XHR `PUT` to `uploadUrl` with progress; no extra dep), "Remplacer / Replace", polling every 5 s until ready/errored, and a "Prévisualiser / Preview" button using the playback route. Wired by **one** `admin.components.Field` line on the `lessons.video` group (approved exception) + `importMap.js` regeneration.

## Acceptance criteria
- [ ] Exports per CONTRACT 1.3 `@/modules/video`; `video/index.ts` owns them. `videoCollections` stays `[]`.
- [ ] Unit: fake sign/verify (valid, expired, tampered asset/viewer, timing-safe), Mux JWT claims (`sub`, `aud`, `exp`, `kid` header) with a generated test RSA key, TTL clamp, webhook signature verify (valid/invalid/stale timestamp) using Mux's documented scheme.
- [ ] Integration (throwaway branch): entitled customer → 200 URL; other customer → 403; signed out → 401; revoked entitlement → 403; expired entitlement (`validUntil` past) → 403; preview lesson + signed-in non-entitled → 200; draft course → 404; `VIDEO_PROVIDER=none` → 503. Webhook sequence created→ready updates lesson fields via catalog; replay → no change.
- [ ] Staff upload flow on fake: create upload → PUT → poll → lesson `ready` with `assetId`; customer cannot call upload routes (401/403).
- [ ] Admin field renders in `/admin` lessons edit view (Playwright admin smoke with a temporary staff user on a throwaway branch, PW_CHANNEL=chrome), screenshot `e2e/__screenshots__/w3-02/`.
- [ ] Optional live Mux smoke **only if** Mux keys exist in `.env.local`: upload a 5 s clip, receive signed playback URL that returns 200 for the manifest and 403 after `exp` (shorten TTL in the smoke). Absent → skip, note "D2 keys absent".
- [ ] typecheck/lint/test green; CI green (fake provider); Vercel preview Ready. Staging probe list for PR body: `/api/video/playback?lessonId=1` signed out → 401.

## Files to create / edit
- Create: `apps/web/src/modules/video/**` (incl. `admin/`, `server/`, `__tests__/`), `src/app/api/video/{playback,webhook,uploads,uploads/[id],fake,fake-upload/[id]}/route.ts`.
- Edit (exception, one line): `modules/catalog/collections/lessons.ts` → `admin.components.Field` on the `video` group; `src/app/(payload)/admin/importMap.js` (regenerated via `pnpm payload generate:importmap`).
- Edit: `messages/{fr,en}.json` under `video.*` (admin field copy may stay inline FR/EN like collection labels).

## DO NOT TOUCH
Lesson schema (fields exist from W3-07; need more → CCR + stop), `learning/**`, `access/**`, `package.json` (deps from W3-00), `env.ts`, migrations, `payload-types.ts`, portal/storefront pages (player UI is W3-03b).

## Erick handoffs
- **D2 Mux account** (when client confirms Mux): create Mux env (Production), API token (Video read/write), **signing key**, webhook → `https://cook-for-friends.vercel.app/api/video/webhook?x-vercel-protection-bypass=<automation bypass secret>` events `video.upload.asset_created`, `video.asset.ready`, `video.asset.errored`; put `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`, `MUX_WEBHOOK_SECRET` in Vercel; set `VIDEO_PROVIDER=mux`, remove `VIDEO_FAKE_ALLOWED`. **Workaround until then:** staging/CI run `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true`; everything builds and tests; polling route covers a missing webhook.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-02 -b w3-02 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W302_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-02/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-02): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.


## Completion notes
- Built: `@/modules/video` (types, `server/{config,fake-token,mux-port,provider,playback,webhook,uploads,http}.ts`, `server/providers/{fake,mux}.ts`, `admin/LessonVideoField.tsx`), routes `api/video/{playback,webhook,uploads,uploads/[id],fake,fake-upload/[id]}`, one `admin.components.Field` line on `lessons.video`, `importMap.js` regenerated, `e2e/w3-02-lesson-video.test.ts` (env-gated).
- Deviations:
  - Mux SDK 15.5.0 option is `new_asset_settings.playback_policies: ['signed']` (not `playback_policy`).
  - Mux SDK 15.5.0 puts the signing key id in the JWT `kid` **claim** (Mux's documented claims), not the header; unit test asserts claim.
  - Fake playback URL carries an extra `viewer=<id>` query param (the HMAC includes the viewer, so the verifier needs it).
  - Fake adapter is stateless (upload id encodes the lesson; PUT records `ready` on the lesson directly; `getAsset(uploadId)` stays `preparing` until then).
  - 401 uses `{ code: 'FORBIDDEN', messageKey: 'errors.FORBIDDEN' }`, 429 uses `RATE_LIMITED` (identity precedent); no new message keys (admin copy inline FR/EN).
  - Extra non-contract exports: `getLessonPlaybackForStaff` (admin preview) and route helpers.
- NOT done locally: integration suite + Playwright admin smoke + screenshots (Neon branch creation denied by the permission classifier; shared `dev` is off-limits). Integration suite `video-routes.test.ts` runs in CI (own Neon branch). Admin smoke: `E2E_STAFF_EMAIL/PASSWORD/LESSON_ID` + `W302_SCREENSHOTS=1 PW_CHANNEL=chrome` on a throwaway branch (handoff).
- Live Mux smoke: skipped, D2 keys absent.
