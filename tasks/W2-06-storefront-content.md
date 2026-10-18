---
type: task
id: W2-06
status: pending
wave: 2
module: storefront
agent: frontend-architect
model: sonnet
depends-on: [W2-01, W2-02]
---

# W2-06 — Storefront content pages (home, Payload pages, course list/detail, products)

## Mission
Build the public, bilingual, statically rendered storefront pages that do not involve buying: home and Payload pages from blocks, course catalog and course detail (with upcoming sessions shown as read-only), and the display-only product catalog. W2-10 adds booking on top in the next batch.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + W1-04 entry)
3. This file
4. `docs/DESIGN_SPEC.md` (all)
5. `docs/CONTRACT.md` §1 (storefront, ui rows), §3.1, §4 `@/modules/catalog` (+ CCR-W2-1 in `tasks/W2-02-catalog-read-api.md`), §5.2, §7 (read-only Local API allowed in server components)
6. `docs/MASTER_BUILD_SPEC.md` §3.1, §4 rule 6, §8 (Lighthouse, WCAG 2.2 AA, CWV)
7. `docs/DISCOVERY.md` §4 ("available in French" badge), §7 R7 (no Payload client bundle on public pages)
8. `~/.claude/rules/web/design-quality.md` (anti-template rules)

## Acceptance criteria
- [ ] Routes exist under `src/app/(frontend)/[locale]/(site)/` with translated pathnames from W2-01: `/` (home = Payload page slug `accueil`/`home`), `/[...slug]` (Payload `pages`, 404 via `notFound()` when missing), `/cours` · `/courses`, `/cours/[slug]` · `/courses/[slug]`, `/produits` · `/products`, `/produits/[slug]` · `/products/[slug]`. Folders use the canonical internal href (`courses/[slug]`, `products/[slug]`); next-intl `pathnames` maps the FR URLs. The W1-01 placeholder `src/app/(frontend)/[locale]/page.tsx` is removed (exception) so `(site)/page.tsx` owns `/[locale]`.
- [ ] Block renderers for `hero`, `gallery`, `testimonials`, `cta`, `richText` (Lexical → React, no `dangerouslySetInnerHTML` on unsanitized input) in `components/storefront/blocks/`.
- [ ] Course list: format filter (in-person / online) as URL search param; `CourseCard` with image, title, level, duration, price (`fr-CA`/`en-CA` currency, "taxes en sus"/"plus taxes"), "available in French" badge when `isLocaleFallback`.
- [ ] Course detail: hero, summary, rich description, level, duration, price, materials list titles (no file links), in-person `upcomingSessions` (date/time `America/Toronto`, location name + city) displayed **read-only** inside a `SessionList` component W2-10 will extend; online: lesson titles list. 404 for unknown slug. `generateMetadata` uses course `seo` (full SEO/JSON-LD is W3-06).
- [ ] Courses are read via `@/modules/catalog` functions only; pages/products/media may be read via Local API read-only in server components (CONTRACT §7). No `'use client'` component imports Payload.
- [ ] Static rendering with `export const revalidate = 300` (on-demand revalidation hooks are out of scope; note it).
- [ ] All copy under `storefront.*` in `messages/{fr,en}.json`; nav links from W1-04 resolve to real pages.
- [ ] Playwright `apps/web/e2e/w2-06-storefront.test.ts` (local, dev data): each route above returns **200** in both locales with the expected `h1` text; unknown course slug → 404; axe: 0 serious/critical at 320 and 1440 on home, list, detail (FR + EN); no horizontal overflow at 320. Screenshots committed per W1-04 convention.
- [ ] `pnpm build` green; route bundle for `/[locale]/cours` has no Payload client chunk (check build output / `next build` route table).
- [ ] CI green; Vercel deploy Ready. Staging (no seed content there): `vercel curl /fr/cours` and `/en/courses` → **200** with the list heading (empty state is OK); `/fr` → 200.

## Implementation steps
1. Worktree + env copy; run `next dev` against Neon `dev` (seeded).
2. Pick a specific visual direction within DESIGN_SPEC tokens (editorial, warm bakery) — no default card grids.
3. Build blocks, cards, list/detail pages, products.
4. Playwright + axe, screenshots, build check.
5. Push, CI, Vercel Ready, staging probes.

## Files to create / edit
- Create: `apps/web/src/app/(frontend)/[locale]/(site)/**` (pages listed above, plus `not-found.tsx` if needed), `apps/web/src/components/storefront/**`, `apps/web/e2e/w2-06-storefront.test.ts`, its screenshots.
- Delete (exception): `apps/web/src/app/(frontend)/[locale]/page.tsx`.
- Edit: `messages/{fr,en}.json` under `storefront.*` only.

## DO NOT TOUCH
- Cart, checkout success/cancel pages, booking buttons, availability (W2-10).
- `src/styles/**`, `src/components/ui/**`, `src/components/layout/**` (ui module) — compose, don't edit. If a primitive is missing, build it inside `components/storefront/`.
- `src/i18n/routing.ts` (W2-01), any module under `src/modules/**`, `src/app/sitemap.ts`/`robots.ts` (W3-06).

## Erick handoffs
- None.

## Done when
All criteria ticked, CI green, Vercel deploy Ready, staging probes recorded, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-06 -b w2-06 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
