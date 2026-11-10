---
type: task
id: W4-04
status: pending
wave: 4
batch: 4b
module: platform (observability)
agent: devops-agent
model: sonnet
depends-on: [W4-00, W4-03b]
migration-owner: false
---

# W4-04 — Observability: Sentry (server, edge, client) with PII scrubbing; alerts on webhook, cron and email-job errors

## Mission
Errors in production reach Sentry with **no PII**, and Erick is alerted on Stripe/Mux webhook failures, cron failures and emails that exhausted retries. With no DSN configured (CI, local) Sentry is a strict no-op.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §7 (`SENTRY_DSN`, `SENTRY_AUTH_TOKEN`), §8 · `docs/CONTRACT.md` §1 (platform), §5.1, §6
5. `apps/web/next.config.ts`, `src/proxy.ts`, `src/lib/env.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/video/webhook/route.ts`, `src/app/api/cron/**`, `src/modules/notifications/server/send.ts` (job retry/failure path, W2-22 log hygiene)
6. `@sentry/nextjs` docs for the pinned version (Context7 / vendor docs) — App Router + Next 16 + Turbopack setup, `onRequestError`, `tunnelRoute`

## Ownership
New: `apps/web/src/instrumentation.ts`, `apps/web/src/instrumentation-client.ts`, Sentry server/edge config files (location per the pinned SDK's convention), `apps/web/src/lib/observability/**` (scrubber, `captureWebhookError`, `captureCronFailure`, tests), `apps/web/src/app/global-error.tsx`, `infra/sentry/README.md` (alert rules spec). Edit: `apps/web/next.config.ts` (`withSentryConfig` wrap), `src/proxy.ts` (exclude the tunnel route from the locale matcher), `src/lib/env.ts` + `.env.example` (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG`, `SENTRY_PROJECT`; keep `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`), `src/app/api/cron/**` (capture on failure).
**Approved one-off exceptions (single writer, one call each, no logic change):** `src/app/api/stripe/webhook/route.ts` (commerce) and `src/app/api/video/webhook/route.ts` (video) → call `captureWebhookError` in the existing 5xx path; `src/modules/notifications/server/send.ts` (notifications) → call `captureJobFailure` when the `send-email` job's final attempt fails.

## Dependencies
W4-00 merged (`@sentry/nextjs` pinned), W4-03b merged (it edits the same webhook route logging). Parallel with W4-01, W4-02. Must merge before W4-03a.

## Tasks
1. SDK init: server + edge via `instrumentation.ts` (`register`, `onRequestError` → `captureRequestError`), client via `instrumentation-client.ts`; `sendDefaultPii: false`; traces sample rate low (0.1 prod, 0 when no DSN); **Session Replay off**; `environment` from `SENTRY_ENVIRONMENT` (fallback `VERCEL_ENV`); release from the Vercel git SHA.
2. **`tunnelRoute: '/monitoring'`** (same-origin → CSP `connect-src 'self'` suffices; adblock-safe); exclude it in the `proxy.ts` matcher.
3. **Scrubber** (`lib/observability/scrub.ts`, used as `beforeSend` + `beforeSendTransaction` + `beforeBreadcrumb` on all runtimes): drop cookies and `authorization`/`stripe-signature`/`mux-signature`/`x-vercel-protection-bypass` headers; redact emails (regex) and names in messages/extra; strip query params `token`, `next`, `code`, `session_id`, and any signed URL query (Mux/R2); drop request bodies; drop Stripe `metadata` and `customer_details`. Unit tests with real-shaped fixtures (magic-link verify request, webhook payload, checkout error, Mux playback URL).
4. `captureWebhookError(source, err, { eventId, eventType })` — tags `webhook:<stripe|mux>`, level error, no payload. `captureCronFailure(route, err)` for `api/cron/**` (non-2xx/exception). `captureJobFailure(task, { idempotencyKey })` — no recipient.
5. `withSentryConfig` in `next.config.ts`: source-map upload only when `SENTRY_AUTH_TOKEN` is set (Vercel prod build), `hideSourceMaps`/delete after upload so maps are not public, `disableLogger`, silent in CI. Build must stay green with all Sentry env absent.
6. `global-error.tsx`: FR/EN-neutral minimal error UI (no message keys needed if it renders a bilingual static string; else use `layout.*` keys via W4-02 coordination — prefer static bilingual), reports to Sentry.
7. `infra/sentry/README.md`: Sentry project setup steps for Erick + alert rules as a spec: (a) any event tagged `webhook:stripe` or `webhook:mux` → email immediately; (b) `cron:*` failure → email; (c) `job:send-email` final failure → email; (d) new issue in `production` → daily digest; (e) optional Sentry Cron Monitors for the 3 cron routes (check-ins from the cron routes only if cheap — else document as future). Data scrubbing toggles to enable server-side as defence in depth (Sentry "Data Scrubber", "Scrub IP addresses").
8. Bundle impact: client SDK must not push the storefront over the W4-02 Lighthouse budget — confirm the CI Lighthouse step is still green (it is warn/error depending on merge order; record scores).

## Done When
- [ ] With no DSN: CI build/test/e2e green, zero network calls to Sentry (unit test on init guard).
- [ ] Scrubber unit tests prove: no email, cookie, auth header, token query, Stripe metadata survives; webhook/cron/job capture helpers tested.
- [ ] Webhook 5xx paths, cron failures and `send-email` final failures call the helpers (unit/integration test with a fake transport).
- [ ] Source maps uploaded only with `SENTRY_AUTH_TOKEN`, not served publicly (CI build artifact has no `.map` under `static/` reachable path, or documented SDK behaviour + check).
- [ ] `infra/sentry/README.md` alert spec written; Lighthouse step still green.

## Erick handoffs (workaround in brackets)
1. Create Sentry org/project `cook-for-friends` (EU or US region — note Law 25 data residency in README), DSN → Vercel `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (prod + staging), `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` (prod build only), create the alert rules from the README. [no-op without DSN]

## DO NOT TOUCH
Module logic beyond the three approved one-line calls; `.github/**`; `package.json` (deps came from W4-00); storefront/portal UI.

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
