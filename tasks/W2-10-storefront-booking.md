---
type: task
id: W2-10
status: pending
wave: 2
module: storefront
agent: frontend-architect
model: sonnet
depends-on: [W2-04, W2-06]
---

# W2-10 — Storefront booking: availability, cart, Checkout redirect, success/cancel

## Mission
Let a visitor pick an in-person session (or an online course), review it on the cart page, and pay through Stripe Checkout; then land on bilingual success or cancel pages. Replaces the Google Form + e-transfer step.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + W2-04, W2-06 entries)
3. This file
4. `docs/DESIGN_SPEC.md` (seat states `--color-seats-*`, buttons, forms)
5. `docs/CONTRACT.md` §2 (error envelope), §4 `commerce.getAvailableSeats`, catalog (+ CCR-W2-1), §5.1 `/api/checkout` (+ `/api/checkout/release`, CCR-W2-4 in `tasks/W2-04-seat-holds-checkout.md`), §5.2 cart/success/cancelled
6. `docs/DISCOVERY.md` §6 F1 (15-min hold vs 30-min Checkout), §8 D9 (1 seat per purchase)
7. `apps/web/src/components/storefront/**` and `(site)` pages from W2-06

## Decisions in force
- One item per purchase (D9): the cart holds exactly one course or one session, quantity 1 — no quantity picker, no guest names.
- Selection lives in the URL: `/panier?session=<id>` (in-person) or `/panier?course=<id>` (online). No client cart store.
- Waitlist CTA is hidden in Wave 2 (W3-05).

## Acceptance criteria
- [ ] Course detail `SessionList` shows live availability per session from `commerce.getAvailableSeats` (server-side, `dynamic` data for this block only; the rest of the page stays static/ISR): states ok / low (≤ 3, `--color-seats-low`) / full ("Complet"/"Sold out", button disabled). Each available session has "Réserver"/"Book" → cart URL. Online course has "Acheter"/"Buy".
- [ ] Cart page `/panier` · `/cart`: summary (course title, session date/time `America/Toronto`, location, price, "taxes calculated at checkout" note when D6 tax is off/on), optional email input (validated), "Payer"/"Pay" button. Invalid/missing selection → friendly empty state with link to courses (200, not 500). Sold-out at render → disabled with message.
- [ ] Pay posts `{ lines: [{ courseId, sessionId?, quantity: 1 }], locale, email? }` to `/api/checkout` (same-origin `fetch`), then `window.location.assign(checkoutUrl)`. Error envelope → localized message via `errors.<code>` (`SOLD_OUT`, `CHECKOUT_RATE_LIMITED`, `COURSE_NOT_PURCHASABLE`, generic fallback); button shows loading and is not double-submittable.
- [ ] Success page `/commande/merci` · `/checkout/success`: confirmation copy ("payment received, email on its way"), no PII, no order lookup from `session_id` (webhook may lag). 200 with or without the param.
- [ ] Cancelled page `/commande/annulee` · `/checkout/cancelled`: on mount POSTs `/api/checkout/release` once (client), shows "your seat was released" + back link. 200.
- [ ] Copy under `storefront.booking.*` only. Accessible: buttons/links labelled, live region for errors, focus management after error, keyboard-only flow works.
- [ ] Playwright `apps/web/e2e/w2-10-booking.test.ts` (local, dev data): availability states render (seed has a capacity-1 session), Book → cart shows the right session, Pay sends the exact body (intercept `/api/checkout` with `page.route` and return a stub `checkoutUrl` — UI test only; the real purchase is W2-12), error envelope shows the localized message, cancel page calls release once. axe 0 serious/critical on cart/success/cancel at 320 + 1440, FR + EN.
- [ ] CI green; Vercel deploy Ready. Staging: `vercel curl /fr/panier`, `/en/cart`, `/fr/commande/merci`, `/en/checkout/cancelled` → **200** with expected heading.

## Implementation steps
1. Worktree + env copy; `next dev` on Neon `dev`.
2. Extend `SessionList` with availability + CTAs; cart page (server component reading catalog + availability, client `PayButton`); success/cancel pages.
3. Playwright + axe; push; CI; Vercel Ready; staging probes.

## Files to create / edit
- Create/edit: `apps/web/src/app/(frontend)/[locale]/(site)/{cart,checkout/success,checkout/cancelled}/**` (folders use the canonical internal href; next-intl `pathnames` from W2-01 maps them to `/panier`, `/commande/merci`, `/commande/annulee`), course detail page edits, `apps/web/src/components/storefront/booking/**`, `apps/web/src/components/storefront/SessionList*` (from W2-06), `apps/web/e2e/w2-10-booking.test.ts` + screenshots.
- Edit: `messages/{fr,en}.json` under `storefront.booking.*` only.

## DO NOT TOUCH
- `src/modules/**` (call public surfaces only), `src/app/api/**`, `src/styles/**`, `src/components/ui/**`, `src/components/layout/**`, `src/i18n/routing.ts`, `errors.*` keys (W2-04 owns them).

## Erick handoffs
- None.

## Done when
All criteria ticked, CI green, Vercel deploy Ready, staging probes recorded, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-10 -b w2-10 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
