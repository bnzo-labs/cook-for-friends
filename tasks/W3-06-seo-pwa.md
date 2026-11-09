---
type: task
id: W3-06
status: pending
wave: 3
batch: 3a
module: storefront + portal (PWA files)
agent: frontend-architect
model: sonnet
depends-on: []
migration-owner: false
---

# W3-06 — SEO + PWA: metadata, sitemap, robots, JSON-LD Course/Event, manifest, service worker

## Mission
Make the storefront discoverable (localized metadata with hreflang, sitemap, robots, `Course` + `Event` structured data) and the site installable (manifest + a minimal hand-written service worker that never caches gated content). MASTER §3.1 SEO, §3.5 PWA, DISCOVERY F8.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan; W2-06 note on `revalidate = 300`) · 3. this file
4. `docs/CONTRACT.md` 1.3 §1 (storefront, portal rows), §4 catalog read API, §5.2
5. `docs/DISCOVERY.md` §4 (locales, Bill 96), §6 F8, F12 · `docs/DESIGN_SPEC.md` §1 (tokens for theme color)
6. `apps/web/src/app/(frontend)/[locale]/**`, `src/i18n/{routing,navigation}.ts`

## Decisions in force
- Canonical origin = `NEXT_PUBLIC_SITE_URL` (D8 late-bound; staging is `*.vercel.app`). **Staging must be `noindex`**: robots disallows all and pages emit `noindex` unless `NEXT_PUBLIC_SITE_URL` host is in an allow-list env `SEO_INDEXABLE_HOSTS` (empty default → nothing indexable). W3-00 adds it to `env.ts` in the same batch: read it through one helper `src/components/storefront/seo/indexable.ts`; if W3-00 is not on `main` yet, the helper reads `process.env.SEO_INDEXABLE_HOSTS` and you note it for a one-line swap.
- SW scope `/`; cache **only** static build assets (`/_next/static/**`, fonts, icons) + an offline fallback page. **Never** cache `/api/**`, `/admin/**`, `/*/account/**` · `/*/compte/**`, auth pages, HTML of any page, video, or anything with `Authorization`/cookies-dependent content. Network-only for navigations (offline → fallback page).
- Icons: placeholder generated from `app/icon.svg` (D4 brand pending) — 192/512 PNG + maskable; theme/background color from tokens (`--color-primary`, `--color-bg`) as hex computed at build is acceptable **only** inside `manifest.ts` (document it; manifest cannot read CSS vars).

## Acceptance criteria
- [ ] `generateMetadata` on home, course list, course detail, product list/detail, Payload pages: localized title/description (course `seo.*` → fallback summary), `alternates.canonical` + `alternates.languages` (`fr-CA`, `en-CA`, `x-default` → FR) using next-intl `getPathname` (translated slugs per locale — course slug differs per locale), OG + Twitter cards with hero image. One `h1` untouched.
- [ ] `src/app/sitemap.ts`: home, course list, every published course (both locales, translated slugs, `lastModified`), products, Payload pages; excludes account/auth/cart/checkout/certificate pages. `src/app/robots.ts` per the noindex rule; sitemap URL absolute.
- [ ] JSON-LD (escaped `<script type="application/ld+json">`, `<` → `<`): course detail emits `Course` (name, description, provider Organization, inLanguage, offers price CAD) and, for in-person, one `Event` per upcoming session (`startDate`/`endDate` ISO with offset, `eventAttendanceMode` Offline, `location` Place + PostalAddress, `offers.availability` InStock/SoldOut from `commerce.getAvailableSeats` — reuse what the page already loads, no extra query per session if avoidable), `eventStatus` Scheduled/Cancelled. Validated in a unit test against a hand-written schema check (no new dep).
- [ ] `src/app/manifest.ts` (name/short_name FR default, `lang: 'fr-CA'`, `start_url: '/fr/compte'`, `display: 'standalone'`, icons). `public/sw.js` per rules above, versioned cache name, old caches deleted on activate. Registration: a tiny client component `src/components/pwa/RegisterSW.tsx` mounted once in `src/app/(frontend)/[locale]/layout.tsx` (**approved one-line exception**), production only.
- [ ] Offline fallback page (static, localized FR/EN text inside the SW-served HTML or a static route excluded from auth) — copy under `pwa.*`.
- [ ] Playwright `e2e/w3-06-seo-pwa.test.ts`: hreflang/canonical on FR + EN course detail (translated slug), JSON-LD parses and has `Event` count = upcoming sessions on the seed in-person course, `/sitemap.xml` 200 + contains both locales, `/robots.txt` disallows on non-allow-listed host, `/manifest.webmanifest` 200, SW registers and `caches` never contains an `/account`/`/compte`/`/api` entry after visiting them (seed customer not needed — visit login page + an API URL). Lighthouse not required here (W4).
- [ ] Note for W4 in Completion notes: on-demand revalidation (Payload `afterChange` → `revalidatePath`) still out of scope; `revalidate = 300` remains.
- [ ] typecheck/lint/test green; CI green; Vercel preview Ready. Staging probes (in PR body): `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` → 200.

## Files to create / edit
- Create: `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/manifest.ts`, `public/sw.js`, `public/icons/**`, `src/components/pwa/**`, `src/components/storefront/seo/**` (JSON-LD builders + tests), `e2e/w3-06-seo-pwa.test.ts`.
- Edit: `generateMetadata` in `src/app/(frontend)/[locale]/(site)/**` pages (metadata only — no layout/markup changes), `src/app/(frontend)/[locale]/layout.tsx` (one mount line), `messages/{fr,en}.json` under `seo.*`, `pwa.*`.

## DO NOT TOUCH
`src/components/storefront/SessionList*` and `booking/**` (W3-01b edits SessionList in 3c), `src/modules/**`, `src/app/api/**`, `src/app/(frontend)/[locale]/account/**` + `auth/**` (W3-01), `src/styles/**`, `src/i18n/**`, `package.json`.

## Erick handoffs
- D8 (domain) late-bound: nothing indexable until `SEO_INDEXABLE_HOSTS` is set at launch (W4). Workaround: default noindex everywhere.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-06 -b w3-06 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W306_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-06/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-06): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

