---
type: task
id: W4-00
status: pending
wave: 4
batch: 4a
module: platform
agent: devops-agent
model: sonnet
depends-on: [W3-11]
migration-owner: false
---

# W4-00 — Wave 4 platform prep: Stripe test mode in the CI e2e job, Lighthouse CI step, Wave 4 deps

## Mission
Extend the W3-11 CI `e2e` job so Wave 4 can prove purchase flows against **real Stripe test mode** (with a signed-events fallback when no key is configured) and gate Lighthouse on the same `next start` server; add the only Wave 4 dependencies. After this task nobody else in Wave 4 edits `.github/**`, `package.json` or the lockfile.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `.github/workflows/ci.yml` (the `e2e` job added by W3-11), `apps/web/test/e2e-seed.ts`, `apps/web/playwright.config.ts`
5. `docs/MASTER_BUILD_SPEC.md` §8, §9, §11 · `docs/CONTRACT.md` §1 (platform, quality), §6
6. `tasks/W3-11-*.md` completion notes (job shape, env, how Stripe is stubbed)

## Ownership (exclusive in Wave 4 batch 4a)
`.github/workflows/ci.yml`, new `.github/workflows/lighthouse-staging.yml`, `apps/web/package.json`, `pnpm-lock.yaml`, initial `apps/web/lighthouserc.json` + stub `apps/web/test/lighthouse-seed.ts` (both handed to W4-02 after merge).

## Dependencies
Starts when W3-11 (CI `e2e` job) is merged on `main`. Parallel with W4-03b and W4-05 (disjoint paths).

## Tasks
1. **Deps (exact pins, release ≥ 14 days old, Next 16.3.8 / React 19.2.8 compatible — check peer deps on npm):** `@sentry/nextjs` (dependency, consumed by W4-04), `@lhci/cli` (devDependency). Nothing else; any other package → `status: blocked`.
2. **Stripe mode gate in the `e2e` job:** read secret `STRIPE_CI_SECRET_KEY` (test-mode / sandbox key, `sk_test_` or `rk_test_`; reject anything else with a failing step — never live). Present → `E2E_STRIPE_MODE=live-test`: install Stripe CLI at a pinned release (download + SHA-256 verify, no Homebrew), run `stripe listen --api-key "$STRIPE_CI_SECRET_KEY" --print-secret` to get the session `whsec_…` (mask it) → `STRIPE_WEBHOOK_SECRET`; start `stripe listen --forward-to http://localhost:3000/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,invoice.finalized` in the background **before** `next start`, logs to a file uploaded as artifact; `STRIPE_SECRET_KEY=$STRIPE_CI_SECRET_KEY` for build + server. Absent → `E2E_STRIPE_MODE=signed-events`, random `whsec_ci_<hex>` exported as `STRIPE_WEBHOOK_SECRET` (W4-01 signs synthetic events with it) and keep W3-11's stub behaviour; job notice "Stripe test key absent — signed-events mode".
3. **Serialize live Stripe runs:** job-level `concurrency: { group: e2e-stripe-live, cancel-in-progress: false }` only when the key is present (or always — document choice), so two runs never share one `stripe listen` account stream.
4. **Lighthouse step** in the same job after Playwright, against the running server: `pnpm -C apps/web exec lhci autorun --config=lighthouserc.json`; initial `lighthouserc.json`: URLs `/fr`, `/fr/cours`, `/fr/cours/<seeded in-person slug>` (+ `/en` equivalents), mobile preset (default), `numberOfRuns: 3`, assertions `categories:performance` and `categories:accessibility` `minScore 0.9` at level **warn** (W4-02 flips to `error`), upload `temporary-public-storage` **off** — store reports as a workflow artifact (`.lighthouseci/`). Run `pnpm payload run test/lighthouse-seed.ts` after the W3-11 seed (stub file: no-op with a comment; W4-02 owns it after merge).
5. **Optional staging Lighthouse** `.github/workflows/lighthouse-staging.yml`: `workflow_dispatch` only, never gating, same `lighthouserc` URLs against `https://cook-for-friends.vercel.app` with header `x-vercel-protection-bypass: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}` (skip with notice if absent).
6. Upload Playwright HTML report + traces on failure (if W3-11 did not already).
7. `actionlint` clean; prove both modes in CI: one run without the secret (signed-events notice) — and, if Erick has set the secret by then, one with it (`stripe listen` ready line in the artifact). Record run links.

## Done When
- [ ] `@sentry/nextjs` + `@lhci/cli` pinned exactly; lockfile updated; `verify` job green.
- [ ] `e2e` job exports `E2E_STRIPE_MODE` (`live-test` | `signed-events`) and a matching `STRIPE_WEBHOOK_SECRET`; live key prefix guard fails on a non-test key (shown by a unit-style shell check or dry-run step).
- [ ] `stripe listen` starts before the server, forwards the 6 CONTRACT §6 events, its log is an artifact (live mode).
- [ ] Lighthouse step runs 3 × 6 URLs on the CI server; reports uploaded as artifact; warn-level assertions.
- [ ] `lighthouse-staging.yml` exists, dispatch-only, skips cleanly without the bypass secret.
- [ ] CI run link(s) in Completion notes for signed-events mode (and live mode if the secret exists).

## Erick handoffs (workaround in brackets)
1. Stripe **sandbox** dedicated to CI (Dashboard → Sandboxes → new `cff-ci`), restricted or secret **test** key → `gh secret set STRIPE_CI_SECRET_KEY -R bnzo-labs/cook-for-friends`. Do not reuse the staging test account: its staging webhook endpoint would receive CI events. [signed-events mode]
2. `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET` for the optional staging Lighthouse. [skip]

## DO NOT TOUCH
`apps/web/src/**`, `apps/web/e2e/**` (except none), `apps/web/playwright.config.ts`, `infra/**`, Vercel env, Stripe staging webhook.

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
