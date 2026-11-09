---
type: task
id: W3-00
status: pending
wave: 3
batch: 3a
module: platform
agent: devops-agent
model: sonnet
depends-on: []
migration-owner: false
---

# W3-00 — Platform prep for Wave 3 (deps, video env, R2 presign helper, CI env)

## Mission
Land every shared platform change Wave 3 needs in one PR so feature tasks never touch `package.json`, the lockfile, `env.ts` or CI: approved dependency pins, `VIDEO_PROVIDER=fake` support, an R2 presigned-GET helper, `.env.example` + CI env. No business logic, no migration.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan entry) · 3. this file
4. `docs/CONTRACT.md` 1.3 §1 (platform row), §4 `@/modules/video` (CCR-W3-7), §8 change log (DEP-W3)
5. `docs/DISCOVERY.md` §2 (pins), §5 (video), §6 F8 F9
6. `apps/web/src/lib/env.ts`, `apps/web/.env.example`, `.github/workflows/ci.yml`, `apps/web/src/payload.config.ts` (read only — R2 config)

## Decisions in force
- **DEP-W3 (approved with this plan):** `@mux/mux-node@15.5.0` (DISCOVERY pin), `@mux/mux-player-react@3.14.1`, `@react-pdf/renderer@4.9.0`, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` as **direct** deps pinned to the exact versions already resolved in `pnpm-lock.yaml` via `@payloadcms/storage-s3` (presigner resolves `3.1149.0`; take client-s3's resolved version from the lockfile). Any other new package → `status: blocked`.
- **D2 (video provider) late-bound:** `VIDEO_PROVIDER` enum becomes `mux | bunny | fake | none`. `fake` is accepted only when `VIDEO_FAKE_ALLOWED=true` (set in CI, local, staging-until-Mux-keys; **never production** — W4 deploy checklist). `none` = video disabled (playback returns UPSTREAM). Mux vars required only when `mux`. Missing Mux keys never break build or tests.

## Acceptance criteria
- [ ] `apps/web/package.json` adds exactly the DEP-W3 pins (exact versions, no `^`); `pnpm install` updates `pnpm-lock.yaml`; `pnpm build` green. `@react-pdf/renderer` imported in a server-only smoke test (render a 1-page PDF to a Buffer, assert `%PDF-` header) to prove it works under Next 16 / Node 22 (no Chromium). If it needs `serverExternalPackages`, add it to `next.config.ts` and say why.
- [ ] `env.ts`: enum `mux|bunny|fake|none`, default `none`; `VIDEO_FAKE_ALLOWED` (`"true"` → boolean, default false); superRefine: `fake` without `VIDEO_FAKE_ALLOWED=true` → boot error; `mux` requires `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` (webhook secret stays optional — webhook route answers 503 when absent). Unit tests cover all 5 branches.
- [ ] `src/lib/r2.ts` (new, platform-owned): `presignR2Get(i: { key: string; ttlSeconds: number; filename?: string; contentType?: string }): Promise<{ url: string; expiresAt: ISODate }>` using the R2 env + `@aws-sdk/s3-request-presigner`; TTL clamped 60..900 s; `ResponseContentDisposition` attachment with RFC 5987 filename when given. Unit test with dummy creds (presign is offline): URL host = R2 endpoint, `X-Amz-Expires` = ttl, key path-encoded. Server-only (`import "server-only"` or equivalent guard).
- [ ] `env.ts` also adds `SEO_INDEXABLE_HOSTS` (optional, comma-separated hostnames, default empty → nothing indexable; consumed by W3-06 robots/metadata).
- [ ] `.env.example`: `SEO_INDEXABLE_HOSTS=` (empty), `VIDEO_PROVIDER=fake`, `VIDEO_FAKE_ALLOWED=true`, comment block on D2 and on never setting `fake` in production; Mux vars documented with where to find them. `.github/workflows/ci.yml`: build/test/integration jobs use `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` (replaces `none`).
- [ ] `next.config.ts`: `images.remotePatterns` adds `image.mux.com` (posters) only. No CSP added here (W4); record "CSP must allow `stream.mux.com`, `*.mux.com` media/connect, `image.mux.com` img" in Completion notes for W4.
- [ ] `payload.config.ts`, `src/i18n/**`, `vercel.json`, `infra/**` unchanged (PR #12 owns `payload.config.ts` push change; pathnames for every Wave 3 page already exist).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green; CI green on the PR (integration job not skipped). Vercel preview `Ready`.

## Files to create / edit
- Edit: `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/lib/env.ts`, `apps/web/.env.example`, `.github/workflows/ci.yml`, `apps/web/next.config.ts` (images + externals only).
- Create: `apps/web/src/lib/r2.ts`, `apps/web/src/lib/__tests__/{r2,env-video,react-pdf-smoke}.test.ts`.

## DO NOT TOUCH
`src/modules/**`, `src/app/**`, `src/migrations/**`, `src/payload-types.ts`, `payload.config.ts`, `messages/**`, `vercel.json`, `infra/**`.

## Erick handoffs
- None blocking. D2 Mux keys come later (see W3-02); until then staging runs `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` — list both in the PR body as "Erick/orchestrator: set in Vercel Production + Preview env" (workaround if not set: video routes answer UPSTREAM, nothing else breaks).

## Done when
Criteria ticked, PR open with CI green + Vercel preview Ready, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-00 -b w3-00 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W300_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-00/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-00): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

