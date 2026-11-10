---
type: task
id: W4-03a
status: pending
wave: 4
batch: 4c
module: platform
agent: devops-agent
model: sonnet
depends-on: [W4-02, W4-04]
migration-owner: false
---

# W4-03a — Security headers: CSP, HSTS and the MASTER §8 header set

## Mission
Every response (storefront, portal, auth, API, Payload admin) carries the MASTER §8 security headers. CSP is enforced in production with zero violations across the whole e2e suite (Mux player, fake video in CI, Payload admin, Stripe redirect, Sentry tunnel), and the W4-02 Lighthouse gate stays green with CSP on. No CSP exists today.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §6 D8, §8 · `docs/CONTRACT.md` §1 (platform)
5. `tasks/W3-00-platform-prep.md` completion notes (Mux domains) · `tasks/W3-10-*.md` + `tasks/W4-03b-*.md` (header-related findings) · `tasks/W4-04-observability.md` (Sentry tunnel route)
6. `apps/web/next.config.ts`, `src/proxy.ts`, `src/lib/env.ts`, `src/app/(frontend)/[locale]/layout.tsx` (inline scripts?), `src/modules/video/**` (player origins), `public/sw.js`

## Ownership
New `apps/web/src/lib/security-headers.ts` (+ unit test), `apps/web/next.config.ts` (`headers()` only — W4-04 already wrapped it with Sentry), `apps/web/src/proxy.ts` (only if the nonce option is adopted), `apps/web/src/lib/env.ts` (`CSP_MODE`), `apps/web/.env.example`, `apps/web/e2e/w4-03a-headers.test.ts`.

## Dependencies
W4-04 merged (Sentry wrap + tunnel route are in `next.config.ts`/`proxy.ts`), W4-02 merged (perf baseline to protect). Before W4-03c.

## Decisions baked in (change = orchestrator)
- **CSP mode (Q20 default):** static CSP header built by `security-headers.ts`, applied via `next.config.ts` `headers()`, `script-src 'self' 'unsafe-inline'` (Next App Router inline flight scripts; a nonce forces every page dynamic and kills ISR — conflicts with the §8 Lighthouse NFR). Spike the nonce variant (nonce minted in `proxy.ts`, storefront only) on a branch commit: adopt it **only** if the W4-02 Lighthouse step stays ≥ 90 on all 6 URLs; record numbers either way. Accepted residual risk documented in Completion notes (React escaping, safe Lexical renderer, no `dangerouslySetInnerHTML`).
- Baseline directives: `default-src 'self'`; `img-src 'self' data: blob: https://image.mux.com <R2_PUBLIC_URL origin>`; `media-src 'self' blob: https://*.mux.com`; `connect-src 'self' https://*.mux.com https://*.litix.io` (Sentry goes through the same-origin tunnel); `worker-src 'self' blob:`; `style-src 'self' 'unsafe-inline'`; `font-src 'self'`; `frame-src 'none'` (add only what the e2e proves needed); `frame-ancestors 'none'`; `form-action 'self' https://checkout.stripe.com`; `object-src 'none'`; `base-uri 'self'`; `upgrade-insecure-requests` (prod only). Origins derived from env at build time, never hard-coded twice.
- `CSP_MODE=enforce|report-only` (env, default `enforce`); `report-only` exists for a first staging deploy. `report-uri`/`report-to` → Sentry security endpoint when the DSN is set (derive from DSN; omit otherwise).
- **HSTS (Q21 default):** `max-age=31536000` **without** `includeSubDomains`/`preload` until D8 (domain shared with the Shopify store) is decided; only when `NEXT_PUBLIC_SITE_URL` is https.
- Other headers on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (Payload admin live preview off — verify), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Cross-Origin-Opener-Policy: same-origin`. Keep existing `no-store` on account/API responses.

## Tasks
1. `security-headers.ts`: pure `buildSecurityHeaders(env) → {key,value}[]` + unit tests (directive presence, origin derivation, mode switch, HSTS conditions).
2. Wire `headers()` for `/:path*` in `next.config.ts`; confirm API + admin + static assets get them.
3. `e2e/w4-03a-headers.test.ts`: headers present on `/fr`, `/en/courses/<slug>`, `/fr/compte`, `/admin/login`, `/api/video/playback` (401 still carries them); a page-level listener fails the test on any `securitypolicyviolation`/console CSP error while visiting storefront, cart, success, portal dashboard, player (fake video plays), comments, certificate verify, admin login + a lesson edit view (video field).
4. Spike nonce variant (see above) → decide, record.
5. Verify the W4-02 Lighthouse step and the full W4-01 suite stay green with CSP enforced.

## Done When
- [ ] All listed headers present on page, API, admin and static responses (e2e).
- [ ] Zero CSP violations across the full CI e2e suite (W3/W4 specs) with `CSP_MODE=enforce`.
- [ ] Lighthouse step still green (perf ≥ 90, a11y ≥ 90); nonce spike decision + numbers recorded.
- [ ] Unit tests for `security-headers.ts` green; no hard-coded duplicate origins; `.env.example` documents `CSP_MODE`.

## Erick handoffs
- D8 domain decision → revisit HSTS `includeSubDomains`/`preload` after launch. [no subdomains]

## DO NOT TOUCH
`src/modules/**`, storefront/portal components (CSP must fit the app, not the reverse; a needed app change → fix brief), `.github/**`, `package.json`.

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
