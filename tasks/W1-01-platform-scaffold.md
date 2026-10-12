---
type: task
id: W1-01
status: blocked
wave: 1
module: platform
agent: devops-agent
model: sonnet
depends-on: [W0 approval]
blocked-on: Erick must complete Vercel dashboard config + env vars before staging deploys
---

# W1-01 — Platform scaffold

## Mission
Create the Turborepo + pnpm monorepo with `apps/web` running Next.js + Payload CMS 3 + next-intl. Lock pinned versions, the module skeleton with boundary lint, test tooling and CI, and deploy a blank staging site to Vercel on a Neon staging branch.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md`
3. `docs/DISCOVERY.md` §2 (pins), §4 (i18n), §6 F7, F11
4. `docs/CONTRACT.md` §1 (ownership — you own `platform` paths only), §5.1 cron routes
5. `docs/MASTER_BUILD_SPEC.md` §2 (layout), §7 (env)

## Acceptance criteria
- [x] `pnpm install && pnpm build` succeeds from the repo root with **exactly** the pinned versions (DISCOVERY §2). `packageManager: "pnpm@11.28.5"`, `engines.node: ">=22 <23"`.
- [x] `pnpm dev` serves `/fr` and `/en` (placeholder page using `getTranslations`). `/` redirects to `/fr` when there is no `Accept-Language: en`.
- [x] `/admin` loads the Payload admin (French UI by default) and is **not** caught by `proxy.ts`.
- [x] `src/i18n/locales.ts` is the only place locales are declared. Payload `localization` and next-intl `routing` both import it.
- [x] `src/lib/env.ts` validates every env var in MASTER_BUILD_SPEC §7 with zod (optional groups for Mux/Bunny based on `VIDEO_PROVIDER`). The app fails fast with a readable error when a required var is missing.
- [x] Empty module folders exist: `src/modules/{catalog,identity,access,commerce,scheduling,learning,video,notifications,_shared}/index.ts`. Each exports an empty `<name>Collections: CollectionConfig[] = []`, wired into `payload.config.ts`.
- [x] `src/modules/_shared/types.ts` contains the types from CONTRACT §2 verbatim.
- [x] ESLint `no-restricted-imports` blocks `@/modules/*/!(index)` imports from outside a module. Proven by a fixture that fails lint.
- [x] Postgres adapter configured with `DATABASE_URL` (pooled) and `migrationDir`. `push: false` unless `NODE_ENV=development`. `pnpm payload migrate` uses `DATABASE_URL_DIRECT`.
- [x] R2 storage adapter configured for `media` (collection added later by catalog; adapter config is ready behind a collection slug list).
- [x] Cron route stubs `src/app/api/cron/{expire-holds,reminders,jobs}/route.ts` reject requests without `Bearer CRON_SECRET` (401) and return `200 {ok:true}` otherwise. `vercel.json` crons: expire-holds `*/5 * * * *`, jobs `*/5 * * * *`, reminders `0 * * * *`.
- [x] Vitest runs (one sample test). Playwright is configured (one smoke test hitting `/fr`).
- [x] GitHub Actions: install, lint, typecheck, vitest on PRs. Turbo caching enabled. **CI green on commit 046c50b**.
- [ ] Neon branches `dev` and `staging` exist. Vercel project deploys `main` → staging URL (prod is **not** created). Env vars are set in Vercel staging. **BLOCKED: Erick must complete steps below.**
- [x] `.env.example` lists every variable with comments. `.gitignore` covers `.env*` except the example.

## Implementation steps
1. `git init`. Keep the existing root `.gitignore` (it already ignores `.env*`). Move the root `.env.local` (filled by Erick) to `apps/web/.env.local` once `apps/web` exists, and **never print or log its values**. R2 bucket is **private**: no public access; serve media through Payload's access-controlled file route. Root `package.json` (private, workspaces via `pnpm-workspace.yaml`: `apps/*`, `packages/*`), `turbo.json` (tasks: build, dev, lint, typecheck, test).
2. `packages/tsconfig` (base strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`) and `packages/eslint-config` (incl. the module boundary rule).
3. Scaffold `apps/web` from Payload's blank template at **3.90.2** (`pnpm dlx create-payload-app@3.90.2 -t blank --db postgres`), then move it under `apps/web` and re-pin every version per DISCOVERY §2.
4. Add next-intl 4.14.9: `src/i18n/{locales,routing,request,navigation}.ts`, `messages/{fr,en}.json` with `common.*` keys only, `src/proxy.ts` with the matcher excluding `admin|api|_next|.*\..*`.
5. Restructure the app dir: `app/(frontend)/[locale]/layout.tsx` + `page.tsx`, `app/(payload)/…` from the template.
6. Payload config: `admin.user` left for W1-02 (temporary inline `users` collection allowed, **deleted by W1-02**), `i18n.supportedLanguages {fr, en}`, `fallbackLanguage: 'fr'`, `localization` from `locales.ts`, `@payloadcms/email-resend`, `@payloadcms/storage-s3` (R2 endpoint `https://<account>.r2.cloudflarestorage.com`).
7. `src/lib/env.ts`, `src/lib/payload.ts` (`getPayload({ config })` cached helper).
8. Vitest + Playwright config. CI workflow.
9. Neon + Vercel setup. Deploy staging. Record the URLs in `docs/SESSION.md`.

## Files to create
`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.github/workflows/ci.yml`, `packages/tsconfig/*`, `packages/eslint-config/*`, `apps/web/{package.json,next.config.ts,tsconfig.json,vercel.json,.env.example,vitest.config.ts,playwright.config.ts}`, `apps/web/src/{payload.config.ts,proxy.ts}`, `apps/web/src/i18n/*`, `apps/web/src/lib/{env,payload,db}.ts`, `apps/web/src/modules/*/index.ts`, `apps/web/src/modules/_shared/types.ts`, `apps/web/src/app/(frontend)/[locale]/{layout,page}.tsx`, `apps/web/src/app/(payload)/**`, `apps/web/src/app/api/cron/*/route.ts`.

## Public repo rules (bnzo-labs/cook-for-friends is PUBLIC)
- Git is already connected: `origin` = `https://github.com/bnzo-labs/cook-for-friends.git`, branch `main` tracks `origin/main`. The root `.gitignore` merges GitHub's Node template with our rules. Keep both.
- Before **every** commit, run `git diff --cached` and check that no secret, connection string, API key or `.env*` file other than `.env.example` is staged. Add a `gitleaks` (or similar) pre-commit check and a CI step.
- CI secrets live only in GitHub Actions secrets. Never echo them in logs.
- Seed data uses fictional people and emails (`@example.com`) only.

## DO NOT TOUCH
- Any collection beyond a temporary `users` stub (W1-02 owns the data model).
- `src/styles/**`, `src/components/**` (W1-04).
- `docs/CONTRACT.md`, `docs/DISCOVERY.md`.
- The production Vercel environment.

## Done when
All criteria are ticked, the staging URL serves `/fr`, `/en` and `/admin`, CI is green on `main`, and the SESSION entry has been added.

## Communication
Caveman. English only.
