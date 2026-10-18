---
type: task
id: W2-01
status: pending
wave: 2
module: platform
agent: devops-agent
model: sonnet
depends-on: []
---

# W2-01 — Platform prep for Wave 2 (jobs queue, jobs cron, translated pathnames, React Email pin)

## Mission
Lay the platform plumbing every Wave 2 module needs: Payload Jobs Queue wiring (empty task arrays that modules fill), the `/api/cron/jobs` route, next-intl translated pathnames for every CONTRACT §5.2 page, and the approved `@react-email/components` pin. No business logic.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + all W1 entries)
3. This file
4. `docs/CONTRACT.md` §1 (platform row), §5.1 cron rows, §5.2 pages, §6 (internal jobs list)
5. `docs/DISCOVERY.md` §2 (pins), §6 F7, §8 D11
6. `infra/cron-worker/README.md` (who calls `/api/cron/*`)

## Acceptance criteria
- [ ] `apps/web/src/payload.config.ts` has `jobs: { tasks: [...notificationsJobTasks, ...commerceJobTasks] }`, imported from `@/modules/notifications` and `@/modules/commerce` (same pattern as collections). Jobs REST run endpoint is not callable anonymously (`jobs.access.run` = staff/admin only); proven by a test or a 401/403 probe.
- [ ] `apps/web/src/modules/commerce/index.ts` and `apps/web/src/modules/notifications/index.ts` each gain exactly one export: `export const commerceJobTasks: TaskConfig[] = []` / `export const notificationsJobTasks: TaskConfig[] = []` (scaffold only; W2-05 and W2-08 fill them). Nothing else in those modules is touched.
- [ ] With zero tasks, Payload jobs stay disabled and **no migration is generated** (`pnpm payload migrate:create --dry` or equivalent shows no schema diff; do not commit an empty migration).
- [ ] `GET /api/cron/jobs`: 401 without `Authorization: Bearer $CRON_SECRET`; with it, runs `payload.jobs.run(...)` (bounded limit, e.g. 50) and returns `200 {"ok":true,"ran":<n>}`. With jobs disabled (0 tasks) it still returns 200 with `ran: 0` (no throw). Unit test covers 401 + disabled case.
- [ ] `apps/web/src/i18n/routing.ts` defines next-intl `pathnames` for every page in CONTRACT §5.2 (FR / EN), e.g. `/courses` → `/fr/cours` · `/en/courses`, `/courses/[slug]`, `/products`, `/products/[slug]`, `/cart` → `/panier`, `/checkout/success` → `/commande/merci`, `/checkout/cancelled` → `/commande/annulee`, `/certificates/verify/[code]`, `/auth/login` → `/connexion`, `/auth/verify` → `/connexion/verifier`, `/account` → `/compte` and its children. Unit test asserts at least 6 FR/EN mappings via next-intl `getPathname`.
- [ ] `pnpm typecheck` passes. If typed pathnames break `src/components/layout/nav-items.ts` or `NavLinks.tsx`, fix only the hrefs/types there (minimal diff).
- [ ] `@react-email/components` pinned exactly `1.0.12` in `apps/web/package.json`; lockfile updated. If `resend@6.32.1` needs `@react-email/render` as a direct dep for its `react` option, pin it to the **exact version `@react-email/components@1.0.12` already resolves** in the lockfile. Any other new package → stop, `status: blocked`.
- [ ] `/api/cron/expire-holds` and `/api/cron/reminders` are **not** changed (W2-04 / W3-05 wire them). `apps/web/vercel.json` is not changed (no `crons` key, no unknown keys — they broke deploys).
- [ ] CI green on the pushed commit, and the Vercel production deploy for it is `Ready`.
- [ ] Staging: `vercel curl /fr --deployment https://cook-for-friends.vercel.app` → 200 with the shell HTML; `/api/cron/jobs` with the staging `CRON_SECRET` bearer (from `apps/web/.env.staging`, read-only) → 200 `{"ok":true,...}`; without it → 401.

## Implementation steps
1. Worktree + env copy (Operating rules).
2. Add the two empty `*JobTasks` exports, then the `jobs` block in `payload.config.ts`. Check Payload 3.90.2 `jobs` options in `node_modules/payload/dist/queues/config/types`. Do not add `autoRun` (serverless; the Cloudflare worker drives `/api/cron/jobs`).
3. Implement `/api/cron/jobs` (Node runtime). Keep the existing bearer check.
4. Add `pathnames` to `routing.ts`; update `navigation.ts` if needed so `Link`/`getPathname` are typed against them.
5. Add the React Email pin, `pnpm install`, `pnpm build` locally.
6. Tests, push, verify CI + Vercel Ready + staging probes.

## Files to create / edit
- Edit: `apps/web/src/payload.config.ts`, `apps/web/src/app/api/cron/jobs/route.ts`, `apps/web/src/i18n/routing.ts`, `apps/web/src/i18n/navigation.ts` (if needed), `apps/web/package.json`, `pnpm-lock.yaml`.
- Edit (scaffold exception, one line each): `apps/web/src/modules/commerce/index.ts`, `apps/web/src/modules/notifications/index.ts`.
- Edit only if typecheck requires: `apps/web/src/components/layout/nav-items.ts`, `apps/web/src/components/layout/NavLinks.tsx`.
- Create: `apps/web/src/app/api/cron/jobs/__tests__/route.test.ts` (or under `apps/web/test/`), `apps/web/src/i18n/__tests__/pathnames.test.ts`.

## DO NOT TOUCH
- `apps/web/vercel.json`, `infra/**`, `src/migrations/**`, `src/payload-types.ts`.
- `src/modules/_shared/**` (W2-03 adds `TxContext` this wave).
- Any module internals beyond the one-line scaffolds. Any page under `src/app/(frontend)/**`.
- `messages/{fr,en}.json` (no new keys needed).

## Erick handoffs
- None required for this task. (If staging probes fail because Vercel protection blocks `vercel curl`, log it and continue.)

## Done when
All criteria ticked, CI green, Vercel deploy Ready, staging probes recorded in this file, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-01 -b w2-01 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally. Never commit `apps/web/AGENTS.md` or `apps/web/CLAUDE.md` generated by `next dev`.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after. CI creates its own branch per run.
- Migrations: Neon `dev` first, then `staging`. **Never Neon `production`.**
- Verify on the real target: final HTTP 200 + expected content. A 307 is not "loads". Staging is Vercel-auth protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`.
- After pushing: CI green **and** Vercel prod deploy `Ready` (`vercel ls`; failure reason via `vercel api /v13/deployments/<id>`).
- `messages/{fr,en}.json` is shared: add keys only under your own namespace; on rebase conflict keep both sides.
- Rebase on `origin/main`, push to `main`. Small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.
