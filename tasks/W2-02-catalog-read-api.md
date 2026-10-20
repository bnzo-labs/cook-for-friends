---
type: task
id: W2-02
status: complete
wave: 2
module: catalog
agent: backend-engineer
model: sonnet
depends-on: []
---

# W2-02 — Catalog read API + commerce-facing catalog functions

## Mission
Implement the catalog module's public functions (CONTRACT §4 `@/modules/catalog`) so the storefront and commerce can read courses, sessions and settings without touching catalog collections directly. Includes the additions in CCR-W2-1 below.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry: CCR list, batches)
3. This file
4. `docs/CONTRACT.md` §2, §3.1, §3.7, §4 `@/modules/catalog`, §7
5. `docs/DISCOVERY.md` §4 (localization, fallback badge)
6. `apps/web/src/modules/catalog/**` (collections built in W1-02), `apps/web/src/seed/data.ts` (test data shape)

## Contract Change Request (CCR-W2-1) — assumed approved at plan review
Additive to `@/modules/catalog`, plus one replacement that removes a catalog → commerce import cycle (commerce also imports catalog):
```ts
// added
export function getCourseCommerceRecord(courseId: ID): Promise<CourseCommerceRecord | null>
//   { id, format, status, price /*cents*/, title: {fr,en}, summary: {fr,en}, slug: {fr,en},
//     stripeProductId: string|null, stripePriceId: string|null, stripeSyncStatus, heroImageUrl?: string }
//   Reads the PUBLISHED version only (never drafts).
export function getSessionView(sessionId: ID, locale: Locale): Promise<SessionView | null>
//   { id, courseId, courseSlug, courseTitle, startsAt, endsAt, location {name,address,city,postalCode?,mapsUrl?},
//     capacity, status }  — no availability
export function recordCourseStripeSync(courseId: ID, patch: { status: 'pending'|'synced'|'error'; productId?: string; priceId?: string; error?: string | null }): Promise<void>
//   writes stripeSyncStatus/stripeProductId/stripePriceId/stripeSyncError with context { skipStripeSync: true }
// replaced
// getSessionWithAvailability(sessionId) → removed. Storefront composes getSessionView/CourseView.upcomingSessions
// with commerce.getAvailableSeats(sessionId). Catalog never imports commerce.
```
If Erick rejects the replacement: keep `getSessionWithAvailability` out of this task and log it; the orchestrator re-plans.

## Acceptance criteria
- [x] `@/modules/catalog` exports: `getPublishedCourse(slug, locale)`, `listPublishedCourses(locale, filter?)`, `getSiteSettings()`, `getCancellationPolicy()`, and the three CCR-W2-1 functions. Return types (`CourseView`, `CourseCard`, `SessionSummary`, `SessionView`, `SiteSettings`, `CancellationPolicy`, `CourseCommerceRecord`) are exported from `catalog/types.ts` and expose no Payload internals.
- [x] `CourseView` includes `upcomingSessions: SessionSummary[]` (status `scheduled`, `startsAt > now`, ascending) for in-person courses, and `lessons` titles only (no body, no video) for online courses.
- [x] Localized reads use `locale` with `fallbackLocale: 'fr'`. `CourseView`/`CourseCard` carry `isLocaleFallback: boolean` (true when the requested EN title/summary is missing and FR is shown), for the "available in French" badge.
- [x] Only published courses are returned (`status: 'published'` and published draft version). A draft-only change is never visible. Test: publish a course, save a draft title change → `getPublishedCourse` still returns the published title.
- [x] `getPublishedCourse` resolves by the localized slug of the requested locale (`/fr/cours/pain-au-levain` vs `/en/courses/sourdough-bread`); an EN request with an FR-only slug returns `null` unless EN slug falls back (document the chosen rule in a test).
- [x] `recordCourseStripeSync` updates only the four sync fields, does **not** publish pending drafts and does **not** create a new draft version. Test: course with a pending draft → call it → published doc has the new `stripePriceId`, pending draft still unpublished.
- [x] `getSiteSettings()` returns defaults when the global is empty (`maxSeatsPerPurchase: 1`, `holdMinutes: 15`, …) matching CONTRACT §3.1.
- [x] Integration tests (real Postgres, throwaway Neon branch, seed data) cover every exported function; unit tests cover mapping helpers. Whole suite passes locally; CI green.
- [x] No migration, no collection field change, no `payload-types.ts` change.

## Implementation steps
1. Worktree + env copy. Throwaway Neon branch from `dev`, `pnpm payload migrate`, `pnpm seed`.
2. `catalog/types.ts`, then `catalog/server/{courses,sessions,settings,stripe-sync-record}.ts` using `@/lib/payload` Local API with `overrideAccess` only where the function is an internal module read.
3. Export from `catalog/index.ts`. Keep `catalogCollections`/`catalogGlobals` exports unchanged.
4. Tests in `catalog/__tests__/read-api.test.ts`.
5. Push, CI, Vercel Ready.

## Files to create / edit
- Create: `apps/web/src/modules/catalog/types.ts`, `apps/web/src/modules/catalog/server/*.ts`, `apps/web/src/modules/catalog/__tests__/read-api.test.ts`.
- Edit: `apps/web/src/modules/catalog/index.ts` (exports only).

## DO NOT TOUCH
- `catalog/collections/**`, `catalog/globals/**`, `catalog/blocks/**` (W2-08 adds the courses hook; W2-09 adds a sessions ui field — later batches).
- Any other module, `payload.config.ts`, `src/migrations/**`, `src/payload-types.ts`, `messages/*.json`.
- Do not import `@/modules/commerce` from catalog.

## Erick handoffs
- Approve CCR-W2-1 at plan review (no runtime handoff).

## Done when
All criteria ticked, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-02 -b w2-02 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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


## Result (2026-10-19, backend-engineer)
- Exported: `getPublishedCourse`, `listPublishedCourses`, `getSiteSettings`, `getCancellationPolicy`, `getCourseCommerceRecord`, `getSessionView`, `recordCourseStripeSync` + types (`catalog/types.ts`). `getSessionWithAvailability` not implemented (CCR-W2-1 replacement approved).
- Slug rule: per-locale match; FR slug resolves under EN only when the course has no EN slug (then card links FR slug). Tested.
- `recordCourseStripeSync` uses `payload.db.updateOne` (no hooks, no version, no publish) and also patches the newest pending-draft version snapshot so publishing it later does not restore stale Stripe ids. `skipStripeSync` context is therefore moot (no hooks run); W2-08 hook need not special-case this path.
- `SiteSettings.maxSeatsPerPurchase` read from global (default 1) for D9 multi-seat. `SiteSettings.legal` exposes page ids only.
- Online `CourseView.lessons` ordered by `course.lessons`, fallback lesson `order`.
- `CourseView.description` is opaque Lexical JSON (`RichTextDoc`).

### Findings (not fixed, out of scope)
- F1 (HIGH, database-specialist): `enum_courses_status` in migration 0001 is `('draft','published')`; collection `status` option `archived` is lost because `_status` shares the enum name. Saving `status: 'archived'` fails in Postgres. Fix: give `status` its own `enumName` + migration, or drop `archived`. Read API already guards `status = published`.
- F2 (LOW): flaky 5 s timeouts in identity/commerce schema tests (password hashing) under CPU/disk contention.
