---
type: task
id: W3-01
status: pending
wave: 3
batch: 3b
module: portal
agent: frontend-architect
model: sonnet
depends-on: [W3-07, W3-09]
migration-owner: false
---

# W3-01 — Portal shell: login/verify pages, account layout, dashboard, my courses, sessions, history, receipts, profile, community link

## Mission
A customer signs in with a magic link and lands in a bilingual portal that shows what they own: online courses (from entitlements), upcoming and past in-person seats, receipts, profile with preferred language, and the community link. Read-only for seats in this task — cancellation UI, certificates and progress land in 3c (W3-01b, W3-03b).

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 3 plan) · 3. this file
4. `docs/CONTRACT.md` 1.3 §4 identity (`requireCustomer`, `updateCustomerProfile`), access (`listActiveEntitlements`), catalog (`listCoursesByIds`, `getSiteSettings`), commerce (`listCustomerEnrollments`, `listCustomerOrders`, `getOrderReceiptUrl` route `/api/orders/:id/receipt`), §5.1 auth routes, §5.2 portal pages
5. `docs/DISCOVERY.md` §3 (magic-link flow: verify page never consumes on GET) · `docs/DESIGN_SPEC.md` (EmptyState, FormField, CourseCard, LocaleSwitcher)
6. `apps/web/src/app/api/auth/**` (request/verify/logout bodies + responses), `src/components/{layout,storefront}/**`, `src/i18n/{routing,navigation}.ts`

## Decisions in force
- Auth pages (`/connexion` · `/auth/login`, `/connexion/verifier` · `/auth/verify`): login form POSTs JSON to `/api/auth/magic-link/request` and always shows the same "check your inbox" state (no enumeration). Verify page reads `token` from the query, shows a "Se connecter / Sign in" button that POSTs it (never auto-submits on load — mail-scanner prefetch, DISCOVERY §3); on success follow the 303 to `next`; invalid/expired → localized error + "send a new link". Token never logged, never in analytics, stripped from history after submit (`history.replaceState`).
- `/account/**` layout calls `requireCustomer(headers)` (server) — unauthenticated → redirect to localized login with `next` = current localized path. Pages are `dynamic = 'force-dynamic'`, `Cache-Control: private, no-store`; no ISR.
- D3: community link from `getSiteSettings().communityUrl`; empty → the block is not rendered (no dead link). External link `rel="noopener noreferrer"`, target blank with visually-hidden "(opens in new tab)".
- Profile: first/last name, phone, dietary notes, preferred language (FR/EN), marketing consent (Law 25: unchecked by default, explicit). Email shown read-only ("contact us to change"). Server action → `identity.updateCustomerProfile`; on locale change, redirect to the same page in the new locale.
- Sessions page lists seats from `listCustomerEnrollments`: own seats and guest seats I booked (badge "Invité·e: <name>" / "Guest: <name>"), upcoming vs past, status badges (confirmed/cancelled/refunded). **Leave a slot** (`data-enrollment-id`, `data-cancel-slot`) on each upcoming confirmed row for W3-01b's cancel button — no cancel UI here.
- My courses (dashboard + `/account` section): online entitlements → `listCoursesByIds` cards linking to `/account/courses/[slug]` (the player page itself is W3-03b; until then the link 404s on preview — acceptable, note it). In-person entitlements are represented by their sessions, not as course cards.
- Receipts: `listCustomerOrders` table (number, date, total fr-CA/en-CA, status); "Reçu / Receipt" link → `/api/orders/<id>/receipt` when `hasReceipt`, else "en préparation / being prepared".
- History page: past sessions + placeholder section anchor `#certificates` (filled by W3-01b).
- Nav: Tableau de bord · Mes cours · Mes séances · Historique · Reçus · Profil · Déconnexion (POST `/api/auth/logout` form, Origin-checked by the route). Account nav in `components/portal/**`; header "Mon compte / My account" link when signed in is **out of scope** (layout is ui-owned) — note it for Wave 4.

## Acceptance criteria
- [ ] Routes exist and render 200 for a signed-in customer in FR + EN: `/account`, `/account/sessions`, `/account/history`, `/account/receipts`, `/account/profile` (translated public paths per `routing.ts`); 307/303 → localized login when signed out, with `next` preserved and validated same-origin by identity.
- [ ] Login + verify pages per decisions; e2e drives the full loop on a throwaway Neon branch using the identity test sender seam (`setMagicLinkEmailSender` captured token) or a test-only token minted by an integration helper in `apps/web/test/` — never a real inbox.
- [ ] Data correctness (integration-backed e2e or server-component tests with seeded data): buyer with a 3-seat order sees 3 seat rows (2 badged guest); guest sees only their seat; customer with 1 online entitlement sees exactly that course card and no other course; revoked entitlement → card gone; orders newest first; receipt link only when `hasReceipt`.
- [ ] Profile save updates fields, validation errors inline (FormField, `aria-describedby`), locale switch redirects; consent unchecked by default.
- [ ] EmptyState for no courses / no sessions / no receipts with CTA to `/cours` · `/courses`.
- [ ] No PII in URLs, no customer data in client bundles beyond what each page renders; all copy under `portal.*` (and `auth.*` for login/verify — new namespace, yours).
- [ ] Playwright `e2e/w3-01-portal.test.ts` (PW_CHANNEL=chrome): login loop, guard redirect, each page FR + EN, axe 0 serious/critical at 320 + 1440, no horizontal overflow at 320, keyboard-only nav through account menu, screenshots to `e2e/__screenshots__/w3-01/`.
- [ ] typecheck/lint/test green; CI green; Vercel preview Ready. Staging probes for PR body: `/fr/connexion`, `/en/auth/login` → 200; `/fr/compte` signed out → redirect to `/fr/connexion?next=…`.

## Files to create / edit
- Create: `src/app/(frontend)/[locale]/account/{layout,page,loading,error}.tsx`, `account/{sessions,history,receipts,profile}/**`, `src/app/(frontend)/[locale]/auth/{login,verify}/**`, `src/components/portal/**` (except `portal/player/**`, `portal/comments/**` — W3-03b), `e2e/w3-01-portal.test.ts`, `apps/web/test/portal-fixtures.ts` (seed helpers; quality path, approved).
- Edit: `messages/{fr,en}.json` under `portal.*` (except `portal.player.*`, `portal.comments.*`, `portal.sessions.cancel.*`, `portal.history.certificates.*`) and `auth.*`.

## DO NOT TOUCH
`src/modules/**`, `src/app/api/**`, `account/courses/**` (W3-03b), `src/components/{ui,layout,storefront}/**`, `src/styles/**`, `src/i18n/**`, `[locale]/layout.tsx` (W3-06 owns its one-line edit), migrations.

## Erick handoffs
- D3 community URL: set `site-settings.communityUrl` in `/admin` when the client picks WhatsApp/Discord/Skool. Workaround: block hidden while empty.

## Done when
Criteria ticked, PR open, CI green, `status: complete`.

## Operating rules (Wave 3 — standing, from Wave 1–2 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-w3-01 -b w3-01 origin/main`; then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md` generated by `next dev`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests once W3-00 is on `main` (before that: `none`).
- **Never boot Payload/Next in dev mode against the shared Neon `dev` branch.** Dev boot used to push schema and corrupted job enums + wrote a batch −1 row (PR #12). Schema push is now **opt-in only via `PAYLOAD_DB_PUSH=1`** — never set it against `dev`/`staging`. To run the app locally: `NODE_ENV=production pnpm build && pnpm start` against `dev`, **or** `next dev` against a throwaway Neon branch (`neonctl branches create --project-id empty-rain-36048098 --parent dev`), migrated with `pnpm payload migrate`, deleted after.
- **Integration tests:** throwaway Neon branch from `dev` + `TEST_DATABASE_URL`; delete after. CI creates its own branch per run — the integration job must actually run your tests (not skipped).
- **Migrations:** only the batch's named migration owner runs `migrate:create` and regenerates `src/payload-types.ts`. Verify up/down/up on a throwaway branch. Do **not** apply to shared `dev`/`staging` yourself — the orchestrator applies after merge. **Never Neon `production`.** Anyone else who needs a schema change: `## Contract Change Request` in this file, `status: blocked`, exit.
- **i18n:** every next-intl `t()` whose message has ICU placeholders gets its values (`t('x', { count })`) — a missing value renders the raw key/throws in prod. EN + FR key parity is enforced by the i18n test: add both or neither. Keys only under your own namespace(s) in `messages/{fr,en}.json`; on rebase conflict keep both sides.
- **`[locale]` routes:** call `assertLocale(params.locale)` (404 on bogus locale) **before** any DB/module call.
- **Dates:** format with `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`. No CSS `capitalize` / `uppercase` on FR dates or weekday/month names (French is lower-case).
- **Contrast:** text ≥ 4.5:1. Secondary text uses `text-fg-muted`, never `text-fg-subtle` (decorative only). No hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome: `PW_CHANNEL=chrome` (config maps it to `channel: 'chrome'`); no bundled-browser downloads. axe 0 serious/critical at 320 + 1440, FR + EN for every new page. Screenshots behind an opt-in env flag (`W301_SCREENSHOTS=1`), committed to `apps/web/e2e/__screenshots__/w3-01/<locale>-<name>-<width>.png` (320/768/1440), same pattern as `e2e/w2-10-booking.test.ts`.
- **Git:** small conventional commits (`feat(<module>): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Rebase on `origin/main`; **never force push** (if a rebase is needed after push, merge `origin/main` instead). Push the branch, **open a PR** (`gh pr create`, title `feat(W3-01): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, test evidence (CI run link), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`.** Notes go in the PR body and in `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Verify on the real target** where a criterion says staging: final HTTP 200 + expected content (a 307 is not "loads"). Staging is Vercel-protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`. Staging probes run after merge by the orchestrator unless this file says otherwise — list the exact probes in the PR body.
- **Fully autonomous.** Never wait for Erick: every handoff below has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR/issue note, exit.
- Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

