---
type: task
id: W4-02
status: pending
wave: 4
batch: 4b
module: storefront + portal + ui (perf/a11y fixes) · quality (Lighthouse config)
agent: frontend-architect
model: sonnet
depends-on: [W4-00]
migration-owner: false
---

# W4-02 — Performance + accessibility: Lighthouse ≥ 90 gated in CI, WCAG 2.2 AA sweep

## Mission
Storefront Lighthouse (mobile) **≥ 90 performance and ≥ 90 accessibility** on home, course list and course detail, FR + EN, enforced as an **error-level** assertion in the CI `e2e` job (W4-00 step); CWV budgets met in the lab (LCP < 2.5 s, CLS < 0.1, TBT < 200 ms as the INP proxy); axe 0 serious/critical on every storefront + portal page; keyboard + reduced-motion verified. The course detail page lost ISR in W2-10 (live seats via `connection()`): measure it first and fix if under budget.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §8, §9 · `docs/DESIGN_SPEC.md` (tokens, contrast, motion) · `docs/CONTRACT.md` §1, §5.2
5. `apps/web/lighthouserc.json`, `.github/workflows/ci.yml` (`e2e` job, Lighthouse step), `apps/web/test/e2e-seed.ts`
6. `src/app/(frontend)/[locale]/(site)/courses/[slug]/page.tsx` (dynamic seats), `(site)/page.tsx`, `(site)/courses/page.tsx`, `src/components/storefront/**`, `src/app/(frontend)/[locale]/layout.tsx`, `src/styles/fonts.ts`

## Ownership
`apps/web/lighthouserc.json` and `apps/web/test/lighthouse-seed.ts` (after W4-00), `apps/web/e2e/w4-02-*.test.ts`, perf/a11y fixes in `src/app/(frontend)/[locale]/(site)/**`, `src/components/storefront/**`, `src/app/(frontend)/[locale]/{account,auth}/**`, `src/components/portal/**`, `src/styles/**`, `src/components/ui/**`, `src/components/layout/**`; message keys only under `storefront.*`, `portal.*`, `ui.*`, `layout.*`.

## Dependencies
W4-00 merged (Lighthouse step + `@lhci/cli`). Parallel with W4-01 (quality specs only) and W4-04 (platform/observability paths). **Must merge before W4-03a** (CSP decision is measured against this baseline).

## Tasks
1. **Baseline:** push a no-op PR commit, collect the warn-level Lighthouse report from the CI artifact for all 6 URLs; table in Completion notes (perf, a11y, LCP, CLS, TBT, LCP element, top 3 opportunities).
2. **Representative seed** (`test/lighthouse-seed.ts`): course hero images and home hero must be real files the CI server can serve (CI R2 is a placeholder → images 404 → unrepresentative LCP). Use small committed fixture images served by the app (e.g. seed media pointing at a `public/` fixture path or a seed-only static URL) — never real client photos (public repo).
3. **Course detail (dynamic) fix ladder** — stop at the first rung that meets budget, record which:
   a. Keep `connection()` inside the seats `Suspense` boundary only; make the shell's data (course, lessons, commerce record, settings) cached server reads (`unstable_cache` with tags/revalidate 300 wrapping the catalog calls in storefront code) so TTFB is not DB-bound; skeleton has fixed dimensions (no CLS when seats stream in); hero `next/image` `priority` + `sizes`; no client JS added above the fold.
   b. Same as (a) for `generateMetadata` (dedupe with `React.cache`).
   c. Only if (a)+(b) fail: client island for seats fed by a commerce read route → that is a **Contract Change Request** (commerce owns `api/sessions/**`): write it under `## Contract Change Request`, set `blocked`, exit. Do not enable `cacheComponents`/PPR (`next.config.ts` is platform-owned; app-wide semantics change).
4. Home + course list: LCP image priority/sizes, font preload (max 2 families, `display: swap`), remove unused client components/JS, avoid layout shift from header/locale switcher/Toaster.
5. Flip `lighthouserc.json` assertions to `error` for perf ≥ 0.9 and a11y ≥ 0.9 on all 6 URLs; add `largest-contentful-paint` ≤ 2500, `cumulative-layout-shift` ≤ 0.1, `total-blocking-time` ≤ 200 as `error`. Median of 3 runs.
6. **a11y sweep** `e2e/w4-02-a11y.test.ts`: every storefront + portal + auth page (CONTRACT §5.2) FR + EN at 320 and 1440 → axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` tags) 0 serious/critical; keyboard: skip link, header nav, mobile menu, cart quantity + guest fields, checkout button, player controls reachable with Tab, visible focus; `prefers-reduced-motion: reduce` → no transform/opacity animations running; target size ≥ 24 px on interactive controls (WCAG 2.5.8). Portal pages use the seeded customer (helper from W3-11/W4-01, read-only use).
7. Fix every violation in owned paths. Anything outside (admin, Payload UI) → listed in Completion notes, not fixed.
8. Optional: dispatch `lighthouse-staging.yml` once (if the bypass secret exists) and record staging numbers as informative.

## Done When
- [ ] CI `e2e` job Lighthouse step at `error` level green: perf ≥ 90, a11y ≥ 90 on `/fr`, `/en`, `/fr/cours`, `/en/courses`, FR + EN course detail (run link + scores table).
- [ ] LCP < 2.5 s, CLS < 0.1, TBT < 200 ms (lab, median) on the same URLs.
- [ ] Course detail: seats still live (no cached seat count — existing booking e2e and W4-01 "1 seat left" assertion stay green), fix rung recorded.
- [ ] `w4-02-a11y.test.ts` green in CI: 0 serious/critical, keyboard + reduced-motion + target-size checks pass.
- [ ] No new dependency; no change to `next.config.ts`, `.github/**`, `src/modules/**`.

## Erick handoffs
- D4 brand assets/photos: real hero images change LCP; re-run Lighthouse (staging dispatch) after the brand swap. [fixture images]

## DO NOT TOUCH
`src/modules/**`, `src/app/api/**`, `next.config.ts`, `proxy.ts`, `.github/**`, `package.json`, `playwright.config.ts`, `apps/web/e2e/w4-01-*`, `apps/web/test/e2e-stripe/**`, `test/e2e-seed.ts`.

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
