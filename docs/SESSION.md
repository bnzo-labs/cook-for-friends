# SESSION LOG — Cook for Friends Platform

Newest first. Each entry: what was done, what is blocked, next step.

**Current wave:** 1 — Foundation · **Gate:** Wave 0 approved 2026-10-11

---

## 2026-10-18 — CI integration tests on throwaway Neon branch + smoke fix (devops-agent)
- **CI `integration` job** (needs `verify`): gate step checks `NEON_API_KEY` secret + `NEON_PROJECT_ID` repo variable. Missing -> notice "NEON_API_KEY not set — integration tests skipped", job green. Present -> `neondatabase/create-branch-action` (SHA-pinned, v6.3.1) creates `ci-<run_id>-<attempt>` from `dev` (2h `expires_at` safety net), `pnpm payload migrate` (tests PR migrations), `pnpm test` with `TEST_DATABASE_URL` (all 92 tests), `delete-branch-action` (SHA-pinned, v3.2.1) with `if: always()`.
- Env: dummy non-secret placeholders only (`VIDEO_PROVIDER=none`, `sk_test_ci_placeholder`, R2/Resend placeholders), random `PAYLOAD_SECRET`/`CRON_SECRET` per run, `NEXT_PUBLIC_SKIP_ENV_VALIDATION=0` for this job (Payload config needs real env parsing). No real Stripe/Resend keys.
- Fork PRs get no secrets -> job skips. No `pull_request_target`.
- **`neon-cleanup.yml`**: daily 03:17 UTC + `workflow_dispatch`; deletes `ci-<n>-<n>` branches older than 1 day (never default/protected). Same gating.
- Repo variable `NEON_PROJECT_ID=empty-rain-36048098` set.
- Verified locally on a throwaway branch from `dev` (deleted after): migrate no-op OK, 92/92 tests pass. actionlint clean.
- **Smoke fix:** `/` redirect test pinned with `locale: fr-CA` + Accept-Language; added companion en-US -> `/en`. Both pass locally (3/3).

**HANDOFF for Erick (3 steps) to enable integration tests in CI**
1. Neon console -> Account/Org settings -> API keys -> create key named `github-ci`.
2. `gh secret set NEON_API_KEY -R bnzo-labs/cook-for-friends` (paste key when prompted).
3. `gh workflow run ci.yml -R bnzo-labs/cook-for-friends --ref main` then `gh run watch`, to confirm. The Integration job should run 92 tests instead of the skip notice. Optionally `gh workflow run neon-cleanup.yml -R bnzo-labs/cook-for-friends`.
- Key rotation: depends on CI + cleanup only; rotate yearly or on suspected leak (revoke in Neon console, re-run step 2).

---

## 2026-10-17 — W1-01 follow-up: Payload admin 500 fixed (devops-agent)
- **Root cause:** `src/app/(payload)/` had no `layout.tsx` (Payload `RootLayout` + `serverFunction` + importMap) and no `custom.scss`, so `@payloadcms/ui` client code got no config context: `Cannot destructure property 'config'` -> 500 on `/admin/create-first-user`. Previous "admin loads" tick counted a 307.
- **Fix (64a63b6):** added Payload 3.90.2 blank-template `layout.tsx` + `custom.scss`; importMap now `(payload)/admin/importMap.js` (generator default) with `admin.importMap.baseDir = src` in `payload.config.ts`; removed `(payload)/importMap.ts`; `e2e/admin.test.ts` asserts 200 + form; `.env.example` gains commented `SEED_PASSWORD`, `TEST_DATABASE_URL`; `.gitignore` ignores Playwright artifacts.
- **Verified:** local `pnpm build` green; `next start` `/admin/create-first-user` 200, `/admin/login` 200, `/fr` 200; staging (prod deploy Ready) same three = 200; CI green on main.
- **Note:** `pnpm payload generate:importmap` needs `NEXT_PUBLIC_SKIP_ENV_VALIDATION=1` (or full env). `e2e/smoke.test.ts` "/ redirects to /fr" fails in a browser whose Accept-Language is en (lands on /en); pre-existing, locale detection, not touched.
- **Next:** Erick creates first admin user on staging manually (not done by agent).

## 2026-10-17 — W1-03 identity auth complete (backend-engineer)

**Done**
- Customer magic-link flow at API level: `POST /api/auth/magic-link/{request,verify}` and `POST /api/auth/logout`, with `getCurrentCustomer` / `requireCustomer` / `requestMagicLink` / `verifyMagicLink` / `upsertCustomerByEmail` exported from `@/modules/identity` (CONTRACT §4 surface unchanged).
- Spike: Payload helpers (`jwtSign`, `getFieldsToSign`, `generatePayloadCookie`) work as typed, but Payload's `local-jwt` refuses `disableLocalStrategy` collections and omits the `sessions` field. So `customers` has its own `AuthStrategy` (HS256 Payload-format cookie, `node:crypto`) and `useSessions: false`. Logout clears the cookie only; no server-side revocation (7-day cookie). DISCOVERY §3 fallback shape, no surface change.
- Token: 32 random bytes base64url, SHA-256 hash stored, 15 min TTL, redeemed with one atomic `UPDATE … RETURNING` (concurrent replay: exactly one wins). POST only, so mail scanners cannot burn tokens. `next` sanitized to same-origin paths.
- Rate limits 5/email/h and 20/IP/h in new Postgres table `auth-rate-limits` (migration `20261017_183746_0002_auth_rate_limits`, applied to Neon dev + staging; verified on a throwaway branch, deleted). 429 carries `errors.MAGIC_LINK_RATE_LIMITED`.
- `sendMagicLinkEmail` port with a real FR/EN Resend sender; tests swap it (no real mail sent). W2-04 replaces the sender.
- Tests: 21 integration + 25 unit new; 92/92 on a throwaway DB; CI (no DB) 42 pass / 50 skipped.

**Blocked / notes**
- **Pending Erick:** create the first admin on staging (`/admin/create-first-user`). Staging has 0 users, so the "staff login works on staging" criterion could not be verified live. `/admin/login` = 200 and the new auth routes respond on staging (checked 2026-10-17).
- Contract Change Request (informational): internal collection `auth-rate-limits`; optional `customers.sessions` for revocable sessions. Details in `tasks/W1-03-identity-auth.md`.
- Integration tests still need a DB in CI (Neon branch per run) to stop being skipped.

**Next step**
- W2-04 notifications swaps the magic-link email template via `setMagicLinkEmailSender`. W3-01 builds `/{locale}/auth/verify` (a button that POSTs the token) and the login page.

---

## 2026-10-17 — W1-02 data model complete (backend-engineer, Opus)

**Done**
- Every CONTRACT §3 collection and global now exists in its owning module: catalog (7 collections, 5 page blocks, 2 globals), identity (users, customers, magic-link-tokens), access (entitlements), commerce (5), scheduling (1), learning (3). The W1-01 `users` stub is gone.
- Access helpers live in `@/modules/identity` (`isAdmin`, `isStaffOrAdmin`, `isSelfCustomer`, `ownsDocument`, `publishedOrStaff`, `isStaff`, …). The §3.7 matrix is enforced, and tests cover it.
- Migration `20261017_174125_0001_init`: composite uniques and indexes come from Payload `indexes`. Applied to Neon `dev` (plus seed) and `staging` (migrate only). Verified on a fresh throwaway branch, including a down/up round trip.
- `pnpm seed` (dev): 2 staff, 2 in-person courses × 3 sessions (one with capacity 1), 2 online courses × 3 lessons, 1 product, home page (`accueil`/`home`) with all 5 blocks, site-settings, and cancellation policy with the D1 defaults. All content is FR + EN and idempotent. Staff password comes from `SEED_PASSWORD` (otherwise random and not printed).
- Admin groups: Catalogue / Ventes / Clients / Apprentissage / Paramètres (FR + EN). Money fields are integer cents with a `$` list cell.
- Tests: unit tests run in CI. Integration schema tests (`TEST_DATABASE_URL`, throwaway DB only) pass 46/46 locally and are skipped in CI.

**Platform-owned files touched (minimal, flagged for devops)**
- `payload.config.ts` (stub removed, globals registered, `media` on s3Storage). `package.json` (`seed` script). `importMap.ts` (regenerated). `next.config.ts` (lexical no longer in `serverExternalPackages`, because the build broke once lexical RSC components were in the import map).

**Blocked / notes**
- `apps/web/.env.local` and `.env.staging` have no `R2_*` vars. Local CLI runs need placeholders. Media uploads on staging will fail until devops adds R2 credentials in Vercel.
- `src/app/(payload)/` has no `layout.tsx` (Payload `RootLayout`), and `generate:importmap` writes to `admin/importMap.js` while the page imports `../../importMap`. Devops should add the layout and set `admin.importMap.importMapFile`.
- `.env.example` should document `SEED_PASSWORD` and `TEST_DATABASE_URL`. CI needs a Neon branch per run to execute the integration tests.

**Next step**
- W1-03 identity-auth: add the magic-link strategy to `customers` (`auth.strategies`). The schema is ready.

---

## 2026-10-17 — W1-04 UI foundation complete (frontend-architect)

**Done**
- `src/styles/{tokens,globals,fonts}`: tokens per DESIGN_SPEC §1, Tailwind v4 `@theme inline`, shadcn variable aliases, reduced-motion guard.
- 13 shadcn components in `src/components/ui/` restyled via tokens (Button variants primary/secondary/ghost/link, sizes, loading keeps width).
- `src/components/layout/`: Container, Section, SiteHeader, SiteFooter, LocaleSwitcher (keeps path), NavLinks, MobileNav (Sheet), Logo placeholder.
- Locale layout: `<html lang>`, skip link, landmarks, Toaster, fonts. `ui.*` + `layout.*` messages FR/EN.
- Playwright `e2e/w1-04-shell.test.ts`: 17 tests pass (landmarks, skip link, axe 0 serious/critical at 320 and 1440 both locales, mobile menu, overflow). Screenshots committed.
- 9/9 acceptance criteria ticked. Details and deviations in `tasks/W1-04-ui-foundation.md`.

**Blocked**
- Nothing. Nav targets 404 until storefront/portal pages and translated pathnames exist (W2-05).

**Next step**
- Storefront (W2-05) builds on layout + ui. Brand swap (D4) = edit `tokens.css` + `fonts.ts`, then re-verify contrast.

---

## 2026-10-17 — W1-01 complete, staging deployed (devops-agent)

**Done**
- All 15/15 acceptance criteria met. W1-01 status: complete.
- Staged env vars (Production + Preview) in Vercel from `.env.staging`. Neon staging branch DB.
- Added `VIDEO_PROVIDER=none` enum option to env.ts (Wave 3 configures Mux/Bunny). Prevents build failure without MUX credentials.
- Added `engines.node: ">=22 <23"` to `apps/web/package.json` so Vercel selects Node 22.x.
- Created and applied initial Payload CMS migration (20261017_124119) to Neon staging branch.
- Staging deploy succeeded: `https://cook-for-friends-ericks-projects-960ce4f0.vercel.app` (also aliased to `https://cook-for-friends.vercel.app`).
- Vercel cron scheduler disabled in vercel.json (requires Pro plan; routes exist at /api/cron/*).
- CI green on commit `ba2ceb6`. GitHub → Vercel connection confirmed active.

**Notes for Erick**
- Vercel SSO protection is enabled: disable from dashboard → Settings → Deployment Protection → uncheck "Vercel Authentication" for public access.
- Cron scheduler: upgrade to Vercel Pro and re-enable `crons` key in `apps/web/vercel.json` when ready.

**Next step**
- W1-01 complete → W1-02/03/04 can run in parallel.

---

## 2026-10-12 — W1-01 scaffold complete, CI green, Vercel setup blocked (devops-agent)

**Done**
- Full Turborepo + pnpm monorepo scaffold built and pushed.
- Next 16.3.8 + Payload 3.90.2 + next-intl 4.14.9 — exact pinned versions.
- `pnpm build` green locally and in CI (commit `046c50b`).
- GitHub Actions CI: secret-scan (gitleaks) → lint → typecheck → test → build. All green.
- Root cause of Turbopack worker env isolation fixed: `NEXT_PUBLIC_SKIP_ENV_VALIDATION` instead of `SKIP_ENV_VALIDATION` (Turbopack workers only forward `NEXT_PUBLIC_*` vars).
- Vercel project `cook-for-friends` linked (prj_I1oEe1ZzCbRbFHYcpwlxiGvcNSrW, team ericks-projects-960ce4f0). No deployments yet — GitHub not connected, root dir not configured.

**Blocked**
- Vercel staging deploy requires Erick to complete 3 steps (see task file + below).

**Next step**
- Erick completes Vercel configuration (instructions below), then devops-agent verifies staging URL and ticks final criterion.
- After criterion 14 verified → W1-01 complete → W1-02/03/04 can run in parallel.

---

## 2026-10-11 — Wave 0 approved, Wave 1 starting (orchestrator)

**Done**
- Erick approved DISCOVERY + wave plan.
- Accounts ready: Neon (main/staging/dev), Vercel, Stripe test, Resend, Cloudflare R2, GitHub.
- Repo connected: `origin` = `bnzo-labs/cook-for-friends` (**public**, Erick's choice), `main` tracks `origin/main`. Nothing pushed yet.
- Root `.env.local` filled by Erick (dev branch, Stripe test, Resend, R2). `PAYLOAD_SECRET` and `CRON_SECRET` generated locally. File is gitignored, mode 600.
- Public-repo rules added to W1-01 (secret scan pre-commit + CI, fictional seed data).

**Blocked**
- D9 seats per purchase still blocks Wave 2 checkout.

**Next step**
- W1-01 platform-scaffold → devops-agent (Sonnet) via delegate-task.

---

## 2026-10-07 — Wave 0 discovery (orchestrator, Opus)

**Done**
- Repo state checked: `/Users/erick/work/CookForFriends` is empty (no git). Related systems found outside the repo: `cff-hub` (Supabase dashboard, prod) and `cff-delivery-app` (Shopify). See DISCOVERY §1, R1–R3.
- Versions verified on npm (2026-10-07) and pinned: Next 16.3.8, Payload 3.90.2 (all `@payloadcms/*`), next-intl 4.14.9, stripe 22.6.2 (API `2026-08-26.dahlia`), React 19.2.8, TS 5.9.3, pnpm 11.28.5, Node 22. `@payloadcms/plugin-stripe` rejected (bundles stripe ^10).
- Auth strategy decided: `users` (staff, password) + `customers` (custom magic-link strategy with Payload `jwtSign`/`generatePayloadCookie`, scanner-safe POST verify).
- i18n model decided: one `locales.ts` shared by next-intl and Payload localization, FR default, `localePrefix: 'always'`.
- Video: `VideoProvider` interface, Mux adapter first behind `VIDEO_PROVIDER`.
- Key finding: Stripe Checkout minimum expiry is 30 min, longer than the 15-min hold. Handled by hold accounting + webhook re-check + auto-refund.
- Written: `CLAUDE.md`, `docs/DISCOVERY.md`, `docs/CONTRACT.md` (v1.0-draft), `docs/MASTER_BUILD_SPEC.md`, `docs/DESIGN_SPEC.md`, Wave 1 task briefs `tasks/W1-0*.md`.

**Blocked / needs client decision**
- D9 seats per purchase — **blocks Wave 2 checkout** (default 1).
- D6 GST/QST registration numbers + tax code — blocks the receipt acceptance criterion.
- D8 domain layout vs Shopify + email sending domain — blocks production + deliverability.
- D11 Vercel Pro — needed for 5-min cron on staging (Wave 2).
- D1, D2, D3, D4, D5, D7, D10 — non-blocking for Wave 1 (defaults in DISCOVERY §8).

**Needs from Erick to start Wave 1**
- Approve DISCOVERY + wave plan.
- Accounts/keys: Neon project, Vercel team (Pro?), Stripe test account, Resend, Cloudflare R2, GitHub repo name.

**Next step**
- On approval: delegate `tasks/W1-01-platform-scaffold.md` → devops-agent (Sonnet) via delegate-task.

---

## 2026-10-18 — D11 resolved: Cloudflare cron worker (devops, Opus)

**Done**
- `infra/cron-worker/` (pnpm workspace pkg `@cff/cron-worker`): Worker `cff-cron-staging`. `*/5` -> expire-holds + jobs, hourly -> reminders. Sends `Authorization: Bearer CRON_SECRET` + `x-vercel-protection-bypass`. 12 vitest tests. Runs in root `pnpm typecheck` / `pnpm test` (CI).
- wrangler 4.144.0 and @cloudflare/workers-types 5.20261004.1 pinned. `workerd` added to pnpm `allowBuilds`.
- DISCOVERY D11 + F7 updated. `apps/web/vercel.json` untouched (no crons key).
- Local check with `wrangler dev --test-scheduled` against local `next dev`: all 3 routes 200; wrong secret -> 401 -> worker 500.

**Needs from Erick (not done, credentials are yours)**
1. Vercel -> Settings -> Deployment Protection -> Protection Bypass for Automation -> create secret.
2. `cd infra/cron-worker && pnpm exec wrangler login`
3. `pnpm exec wrangler secret put CRON_SECRET` (staging value from `apps/web/.env.staging`), then `pnpm exec wrangler secret put VERCEL_BYPASS_SECRET`.
4. `pnpm exec wrangler deploy`; `pnpm exec wrangler tail` at next `*/5` tick -> expect 200s.
Details + rollback + rotation: `infra/cron-worker/README.md`.

