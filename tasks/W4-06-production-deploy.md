---
type: task
id: W4-06
status: pending
wave: 4
batch: 4d
module: platform (release)
agent: devops-agent
model: sonnet
depends-on: [W4-01, W4-02, W4-03a, W4-03c, W4-04, W4-05]
migration-owner: false
approval-gate: true
---

# W4-06 — Production deploy: checklist + runbook ONLY (APPROVAL GATE)

## Mission
Write `docs/RUNBOOK_PROD.md`: the complete, ordered, copy-pasteable checklist + runbook Erick follows to launch production, verify it, and roll it back. **This task executes nothing against production or staging.** No Vercel env writes, no Neon `main`/`staging` commands, no Stripe live calls, no DNS, no `wrangler deploy`. The orchestrator does not run the runbook either: Erick approves and triggers each step (MASTER §10 approval gate).

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (all Erick handoffs since Wave 1) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §6 (D1–D11), §7, §8, §9, §10 · `docs/DISCOVERY.md` §8 · `docs/CONTRACT.md` §5.1, §6
5. `src/lib/env.ts` (authoritative env list), `.env.example`, `apps/web/vercel.json`, `infra/cron-worker/{README.md,wrangler.toml}`, `infra/sentry/README.md`, `tasks/W4-01` (W2-12 mapping → post-deploy smoke), `tasks/W4-03a` (CSP/HSTS), `tasks/W4-03c` (GO/NO-GO)

## Ownership
`docs/RUNBOOK_PROD.md`. Inert config only, never deployed by this task: `infra/cron-worker/wrangler.toml` `[env.production]` block (name `cff-cron-prod`, `TARGET_URL` placeholder for the prod origin) + README section.

## Dependencies
Draft may start once W4-04 and W4-03a are merged; marked **ready** only after W4-03c says GO (zero open CRITICAL/HIGH) and W4-01/W4-02 are green on `main`.

## Runbook sections (each step: who, command or click path, expected result, verification, abort criteria)
0. **Go/no-go gate:** links to green `main` CI run (verify, integration, e2e incl. live-test Stripe mode, Lighthouse), W4-03c GO line, client sign-off on open decisions below. Erick's written approval line.
1. **Decisions that must be closed before launch** (block or accept default, one line each): D1 cancellation tiers + policy page, D2 Mux (vs no video at launch), D3 community URL, D4 brand/photos, D5 launch date + courses ready, D6 GST/QST numbers + tax code, D8 domain layout vs Shopify + email sending domain, D11 Vercel plan, Q18 prod Vercel project, privacy policy text (Law 25).
2. **Vercel:** Q18 default — a **separate Vercel project** for production (today the staging site is the existing project's *Production* environment with staging values); Pro plan (Hobby forbids commercial use; D11); root dir, Node 22, build command as `vercel.json`; Deployment Protection **off** for the public prod domain; custom domain + DNS records for `NEXT_PUBLIC_SITE_URL` (D8); `www`/apex redirect.
3. **Production env vars** — table generated from `src/lib/env.ts` (every key, prod value source, secret yes/no, who provides): `DATABASE_URL` (Neon `main` pooled), `DATABASE_URL_DIRECT`, `PAYLOAD_SECRET` (new, ≠ staging), `NEXT_PUBLIC_SITE_URL`, `SEO_INDEXABLE_HOSTS` = prod host only, `STRIPE_SECRET_KEY` (live, restricted key recommended), `STRIPE_WEBHOOK_SECRET` (live endpoint), `STRIPE_TAX_ENABLED`, `STRIPE_TAX_CODE`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `R2_*` (prod bucket, separate from staging), `VIDEO_PROVIDER=mux` (or `none`), `MUX_*` (prod Mux environment + signing key + webhook secret), `CRON_SECRET` (new), `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`, `CSP_MODE=enforce`. **Must be absent:** `VIDEO_FAKE_ALLOWED`, `PAYLOAD_DB_PUSH`, `NEXT_PUBLIC_SKIP_ENV_VALIDATION`, any `sk_test_`/`whsec_` from staging. Verification command list (names only, never values).
4. **Database (Neon `main` = production):** create a restore branch `pre-launch-<date>` from `main`; run `pnpm -C apps/web payload migrate` with `DATABASE_URL_DIRECT` of `main` from a clean checkout of the release SHA; verify `payload_migrations` matches the repo list; **no seed** in prod; create the first admin via `/admin/create-first-user`, then staff users; populate `site-settings`, `cancellation-policy`, pages (home, privacy policy FR/EN).
5. **Stripe live:** account activated; Stripe Tax registrations (D6) and tax code; live webhook endpoint `https://<prod>/api/stripe/webhook`, API version `2026-08-26.dahlia`, the 6 CONTRACT §6 events, signing secret → env; branding + FR/EN receipts; publish courses in Payload → verify Products/Prices created in **live** mode (sync backfill); re-save discount codes to create live coupons; confirm no test objects referenced.
6. **Resend:** verified sending domain (SPF, DKIM, DMARC) for `EMAIL_FROM` (D8); test send to a non-owner address.
7. **Mux (D2):** production environment, signing key, webhook to `https://<prod>/api/video/webhook` → `MUX_WEBHOOK_SECRET`; upload + playback check of one lesson.
8. **Cron worker prod:** `wrangler deploy --env production` with prod `CRON_SECRET` (no bypass secret needed if protection is off); `wrangler tail` shows 200s for expire-holds, jobs, reminders.
9. **Sentry:** project + alert rules per `infra/sentry/README.md`; trigger a test error and a test webhook-error event; confirm scrubbed.
10. **Deploy:** promote the approved SHA; watch build; first request checks.
11. **Post-deploy smoke (live, owned by Erick or by the orchestrator only with Erick's explicit OK)** — includes the W2-12 items that CI cannot cover: real webhook delivery to the prod endpoint, Cloudflare cron ticks, real Resend delivery (buyer + guest), Vercel `Ready`. Steps: `/fr`, `/en` 200; robots allows indexing on prod host only; sitemap 200; headers (CSP enforce, HSTS) present; one real low-price in-person purchase with 2 seats (buyer + guest) → emails + `.ics` + attendee list → full refund from admin flow → entitlements revoked; one online purchase → magic link → player; Sentry receives nothing unexpected; Stripe webhook dashboard shows 2xx only.
12. **Rollback:** Vercel instant rollback to previous deployment (app); DB: migrations forward-only — rollback = restore from `pre-launch-<date>` branch (data loss window stated) or run the specific `down()` only for the launch migration set if no prod writes yet; Stripe: disable webhook endpoint, archive live Products if relaunching; cron worker: `wrangler delete --env production` or remove triggers; comms template FR/EN for customers if payments affected.
13. **Day-1/7 checks:** Sentry digest, Stripe disputes/refunds, Neon usage, Resend bounces, Lighthouse staging-dispatch on prod URL.

## Done When
- [ ] `docs/RUNBOOK_PROD.md` covers sections 0–13; env table generated from `env.ts` (scripted or manual diff recorded; zero missing keys).
- [ ] Every step has expected result + verification + abort criteria; no secret values anywhere.
- [ ] Inert `[env.production]` block in `wrangler.toml` (not deployed) + README section.
- [ ] Consolidated Erick checklist at the top of the runbook (one checkbox per external action).
- [ ] PR open; status `ready-for-approval` (not `complete`) — `complete` only after Erick reports the launch done.

## Erick handoffs
Everything in the runbook. This task never performs them.

## DO NOT TOUCH
Vercel/Neon/Stripe/Resend/Mux/Cloudflare/Sentry consoles or APIs in write mode; app code; `.github/**`.

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
