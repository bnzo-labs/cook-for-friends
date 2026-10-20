# DISCOVERY — Cook for Friends Platform (Wave 0)

Status: **AWAITING APPROVAL** · Author: orchestrator (Opus) · Date: 2026-10-07

This document is the Wave 0 output. No application code exists or will be written until this document and the wave plan in `docs/MASTER_BUILD_SPEC.md` §10 are approved.

---

## 1. Current repo state

| Item | Finding |
|------|---------|
| `/Users/erick/work/CookForFriends/` | Empty directory created 2026-10-05. No git history, no files. Wave 0 adds `CLAUDE.md`, `docs/`, `tasks/` only. |
| Related systems (outside this repo) | **Not empty context.** Two Cook for Friends systems already exist — see §7 R1–R3. |
| `/Users/erick/work/cff-hub/` | Internal business dashboard (Next.js 16.2 + Supabase) in production at `horno.cookforfriends.ca`. Has its own `courses`, `clients`, `orders` tables and brand tokens. |
| `/Users/erick/work/cff-delivery-app/` | Shopify app (Remix) for cake delivery date/slot selection. Implies an existing Shopify storefront for cake orders. |

Conclusion: this repo is greenfield for code and data, as the brief states. But the business already has a domain, a brand in use, a Shopify store and an internal dashboard. Those touch-points are listed as risks and client decisions, not migrations.

---

## 2. Verified versions and pins

Verified against the npm registry on 2026-10-07. Rule applied: pin **exact** versions. Prefer the newest patch of a release line that Payload declares as supported, at least ~1 week old. Skip majors that shipped in the last 2 weeks.

| Package | Pin | Latest on registry | Why this pin |
|---------|-----|--------------------|--------------|
| `next` | **16.3.8** | 16.4.0 (released 2026-10-06) | `@payloadcms/next@3.90.2` peer range is `>=16.3.3 <17.0.0` (it also lists patched 15.x lines; the floors follow Next security patches). 16.3.8 is the newest patch on the 16.3 line, which Payload's own templates use (they pin 16.3.3). 16.4.0 is one day old and untested with Payload. Move to 16.4.x only after Payload's templates do. |
| `react` / `react-dom` | **19.2.8** | 19.3.0 | Payload website template pins 19.2.6. Use the newest 19.2 patch. Next 16.3 is tested against 19.2. |
| `payload` + every `@payloadcms/*` | **3.90.2** (all identical) | 3.90.2 (2026-09-23) | All `@payloadcms/*` packages must share one exact version. 3.90.2 has been stable for 2 weeks. |
| `@payloadcms/db-postgres` | **3.90.2** | 3.90.2 | Bundles `drizzle-orm 0.45.2`, `pg 8.20.0`. Works with Neon's pooled connection string. |
| `@payloadcms/richtext-lexical` | **3.90.2** | — | Rich text for pages, lessons and courses. |
| `@payloadcms/storage-s3` | **3.90.2** | — | Cloudflare R2 through the S3-compatible API. |
| `@payloadcms/email-resend` | **3.90.2** | — | Payload's own emails (staff password reset) through Resend. |
| `@payloadcms/translations` | **3.90.2** | — | French admin UI for staff. |
| `@payloadcms/plugin-stripe` | **NOT USED** | 3.90.2 | Depends on `stripe ^10.2.0` (about 12 majors behind) and syncs both directions. We need one-way Payload → Stripe sync with our own price-versioning rules. Custom hooks instead (see CONTRACT §5.3). |
| `next-intl` | **4.14.9** | 4.14.9 | Peer `next ^16`, `react ^19`. Supports the Next 16 `proxy.ts` convention. |
| `stripe` (Node) | **22.6.2** | 23.0.0 (major, released 2026-10-01) | Avoid a 6-day-old major. 22.6.2 is pinned to Stripe API version `2026-08-26.dahlia`. Set `apiVersion` explicitly in code. |
| `@stripe/stripe-js` | **Not needed in MVP** | 10.0.0 | Redirect-to-Checkout uses the server-returned URL. No client SDK needed. |
| `typescript` | **5.9.3** | 7.0.2 | TS 7 (native port) is not what Payload or Next templates test against. Payload's template uses 5.7.3. 5.9.3 is the last 5.x and is safe with `strict`. |
| `tailwindcss` | **4.3.3** | 4.3.3 | Payload template is on `^4.1.18`. v4 CSS-first `@theme` fits token swapping (DESIGN_SPEC). |
| `turbo` | **2.11.7** | 2.11.7 | — |
| `pnpm` | **11.28.5** | 12.10.1 | Payload's templates declare `engines.pnpm: ^9 \|\| ^10 \|\| ^11`. pnpm 12 is outside that range. Pin via `packageManager`. |
| Node.js | **22 LTS** (`@types/node 22.20.5`) | — | Payload needs `>=20.9`. Next 16 needs `>=20.9`. Vercel supports 22. |
| `resend` | **6.32.1** | — | Transactional email from our own modules. |
| `@react-email/components` | **1.0.12** | — | Stable since April 2026. |
| `@sentry/nextjs` | **11.5.0** | — | Check Next 16.3 support in the Wave 1 scaffold. Fall back to the last 10.x if the wizard complains. |
| `vitest` | **5.0.3** | — | Unit and integration tests, including the oversell race against a real Postgres. |
| `@playwright/test` | **1.64.0** | — | Next 16 lists `@playwright/test ^1.51.1` as an optional peer. |
| `@mux/mux-node` | **15.5.0** (only if Mux is chosen) | — | Behind the `VIDEO_PROVIDER` flag. |
| `graphql` | **16.x** (peer of `@payloadcms/next`) | — | Required peer even if GraphQL is disabled. |
| `sharp` | **0.35.4** | — | Payload image resizing (template pin). |

Rule for agents: **no version changes without an orchestrator decision.** Renovate or Dependabot only after launch.

---

## 3. Payload auth strategy: two user types

### Decision: two auth-enabled collections

| Collection | Who | Login | Admin panel access |
|------------|-----|-------|--------------------|
| `users` | Staff. Roles `admin` and `staff` | Email + password (Payload local strategy) | Yes. `admin.user = 'users'` |
| `customers` | Customers. Role `customer` (implied) | Magic link only | **Never.** Blocked from `/admin` by the `access.admin` rule |

Why two collections and not one with a role field:
- Payload's admin panel binds to exactly one auth collection (`admin.user`). Separate collections make it impossible for a customer token to reach `/admin`.
- Each collection needs a different auth config. `users` uses the local strategy. `customers` sets `disableLocalStrategy: true` and adds a custom strategy.
- Customer records carry commerce fields (Stripe customer ID, preferred locale) that staff records do not need.

"Roles: admin, staff, customer" from the brief maps to `users.role ∈ {admin, staff}` plus membership in the `customers` collection.

### Magic-link flow (custom, about 250 LOC, owned by the `identity` module)

Payload 3.90.2 has no built-in magic link. It does export everything needed, verified in the package typings:
- `payload`: `jwtSign`, `getFieldsToSign`
- `payload/shared`: `generatePayloadCookie`, `addSessionToUser`
- Collection auth config: `strategies?: AuthStrategy[]`, `disableLocalStrategy`, `useSessions`

Flow:
1. `POST /api/auth/magic-link/request { email, locale, next? }`. Rate-limited per email and per IP. Upserts a `customers` record by email. Creates a random 32-byte token and stores **only its SHA-256 hash** in `magic-link-tokens` (15 min TTL, single use). Sends the email through `notifications`. The response is always `200` with the same body, so the endpoint cannot be used to discover which emails exist.
2. The email links to `/{locale}/auth/verify?token=…`. That page **does not consume the token on GET**. It shows a "Sign in" button that POSTs the token. Reason: corporate mail scanners (Outlook Safe Links, Gmail link preview) prefetch links and would burn single-use tokens.
3. `POST /api/auth/magic-link/verify { token }` hashes the token, finds an unused and unexpired row, marks it used, calls `addSessionToUser` + `jwtSign` with `getFieldsToSign`, and sets the cookie with `generatePayloadCookie` for the `customers` collection. Then it redirects to `next` (same-origin paths only) or `/{locale}/account`.
4. Server components read the session with `payload.auth({ headers })`. The result's `user.collection` must be `'customers'` for portal routes.

Wave 1 spike requirement: the identity task must prove steps 3–4 with an integration test **before** any portal UI is built. If Payload's internal helpers behave differently than their typings suggest, the fallback is a custom `AuthStrategy` that validates our own signed HttpOnly cookie. Same API surface, no other module affected.

Guest checkout: customers buy without logging in. The webhook upserts the customer by Checkout email. The confirmation email contains a magic link. This is the acceptance path "buys an online course, logs in with a magic link".

---

## 4. One FR/EN model for Payload localization and next-intl

Single source of truth: `apps/web/src/i18n/locales.ts`

```ts
export const locales = ['fr', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'fr'
```

| Concern | Owner | Configuration |
|---------|-------|---------------|
| UI strings (buttons, errors, labels) | next-intl | `messages/fr.json`, `messages/en.json`. `routing = defineRouting({ locales, defaultLocale, localePrefix: 'always' })` |
| Content (courses, lessons, pages, products) | Payload localization | `localization: { locales: [...locales], defaultLocale, fallback: true }`. Fields marked `localized: true` |
| URL | next-intl `proxy.ts` (the Next 16 rename of `middleware.ts`) | `/fr/...`, `/en/...`. `/` redirects by `Accept-Language`, falling back to `fr`. Matcher **excludes** `/admin`, `/api`, `/_next`, static files |
| Slugs | Payload | `slug` is localized: `/fr/cours/pain-au-levain` vs `/en/courses/sourdough-bread`. Path segments are translated with next-intl `pathnames` |
| Emails, PDFs, certificates | `notifications` / `learning` | Rendered with `getTranslations({ locale })` using `customer.preferredLocale` → `order.locale` → `fr` |
| Stripe Checkout | `commerce` | `locale: 'fr' \| 'en'` passed to Checkout. Product names synced in FR. EN goes in Stripe product metadata, since Stripe Product names are not localized |
| Admin UI | Payload | `i18n: { supportedLanguages: { fr, en }, fallbackLanguage: 'fr' }`. Staff see French by default |

Data flow: a page in `[locale]` calls `payload.find({ collection, locale, fallbackLocale: 'fr' })`. Translation is missing from EN content → FR is shown and the course detail shows a small "available in French" badge. Rule: **no hard-coded customer-facing strings anywhere.** A lint rule (`next-intl` ESLint plugin or a custom check) runs in CI.

Bill 96 (Charter of the French Language) note: French as the default and first-presented language satisfies the "predominance" requirement for a Québec business site. Terms of sale and the cancellation policy must exist in French. This is covered by the model above.

---

## 5. Video provider abstraction

Interface owned by `modules/video`, consumed only by `learning`:

```ts
export interface VideoProvider {
  readonly name: 'mux' | 'bunny'
  /** Signed, short-lived playback URL. Caller MUST have checked entitlement. */
  getPlayback(input: { assetId: string; viewerId: string; ttlSeconds: number }): Promise<{
    url: string            // HLS manifest or provider player URL
    posterUrl?: string
    expiresAt: string      // ISO
  }>
  /** Admin upload: returns a direct-upload URL for staff. */
  createUpload(input: { lessonId: string }): Promise<{ uploadUrl: string; uploadId: string }>
  /** Resolve upload → asset (polling or webhook). */
  getAsset(assetIdOrUploadId: string): Promise<{ assetId: string; status: 'preparing' | 'ready' | 'errored'; durationSec?: number }>
}
```

- Selected by `VIDEO_PROVIDER=mux|bunny`. `getVideoProvider()` throws at boot if the provider's env vars are missing.
- `Lesson.video` stores `{ provider, assetId, durationSec }`. Never a URL. Changing provider later means re-uploading and changing `assetId`. No schema change.
- Playback: `GET /api/video/playback?lessonId=` checks `access.hasActiveEntitlement(customer, lesson.course)` and returns a URL with a TTL ≤ 2 hours. The URL is never stored and never rendered into static HTML.
- **Mux**: signed playback policy. JWT signed with the Mux signing key (`sub=playbackId`, `aud=v`, `exp`). Native player `@mux/mux-player-react`.
- **Bunny Stream**: token authentication (`SHA256(securityKey + videoId + expires)`) on the embed URL, or CDN token auth for HLS. Cheaper storage and delivery.
- Recommendation: **implement Mux first.** It has better signed-URL ergonomics, direct uploads and upload webhooks, which means less custom code. The Bunny adapter follows the same interface if the client picks it on cost. This is a client decision (D2).

---

## 6. Other verified findings that shape the design

| # | Finding | Consequence |
|---|---------|-------------|
| F1 | **Stripe Checkout `expires_at` must be at least 30 minutes after creation.** The brief's 15-minute SeatHold is shorter than any Checkout session can be. | The hold stays 15 min in our DB (`SeatHold.expiresAt`). The Checkout session gets `expires_at = now + 30 min`. The cleanup cron calls `checkout.sessions.expire` for sessions whose hold has expired. If payment completes anyway, the webhook re-checks capacity and **auto-refunds** when the seat is gone. That case is in the acceptance tests. |
| F2 | Seat correctness must not depend on a cron. | Available seats = `capacity − confirmed enrollments − Σ quantity of holds where status='active' AND expiresAt > now()` (a hold carries N seats, D9). Expired holds stop counting the moment they expire. Cron only tidies rows and expires Checkout sessions. |
| F3 | Seat allocation transaction | `BEGIN; SELECT … FROM sessions WHERE id = $1 FOR UPDATE; count; INSERT seat_hold; COMMIT`. This runs through Payload's Drizzle instance (`payload.db.drizzle`) with raw SQL in the `commerce` module only. Neon's pooled endpoint (PgBouncer, transaction mode) supports row locks inside a transaction. |
| F4 | Stripe Prices are immutable. | Course price change → create a new Price, set it as `default_price`, archive the old one. Store `stripePriceId` on the Course. Orders keep the price they paid. |
| F5 | Stripe Tax for Québec | Needs the client's **GST and QST registrations** added in Stripe Tax settings (a one-time onboarding task, see D6). Use `automatic_tax: { enabled: true }`, `tax_behavior: 'exclusive'` and a tax code for educational or recreational instruction, confirmed with the client's accountant. Receipts showing GST and QST: use `invoice_creation.enabled: true` in Checkout. The Stripe invoice PDF itemizes GST 5% and QST 9.975% and shows the account's tax registration numbers. |
| F6 | Discount codes | Stripe Promotion Codes with `allow_promotion_codes: true`. Staff manage codes in a Payload `discount-codes` collection that syncs one-way to Stripe Coupons and Promotion Codes. Stripe stays out of the admin's day-to-day. |
| F7 | Vercel Cron | Hobby plans run cron once per day. Hold cleanup (every 5 min) and reminders (hourly) need **Vercel Pro**. *Staging (2026-10-18, D11): a Cloudflare Worker with Cron Triggers calls the routes instead; see `infra/cron-worker/`. Revisit Vercel Pro at launch.* Jobs run through Payload's Jobs Queue, triggered by `/api/cron/*` with `CRON_SECRET`. |
| F8 | PWA on Next 16 | `next build` defaults to Turbopack. Webpack-plugin PWA libraries are a risk. Use `app/manifest.ts` and a small hand-written service worker: static shell cache only, **never** cache entitlement-gated responses or video. |
| F9 | Certificates as PDF on Vercel | No headless Chromium. Use `@react-pdf/renderer` (pure JS). Each certificate has a `verificationCode` (10 chars, Crockford base32) and a public page `/{locale}/certificates/verify/{code}`. |
| F10 | Calendar invites | Generate `.ics` (RFC 5545, `METHOD:PUBLISH`, `TZID=America/Toronto`) and attach it to confirmation and reminder emails, plus "Add to Google Calendar" links. |
| F11 | Payload migrations | Use `push: false` in staging and production. Committed migrations run in the Vercel build (`payload migrate`). Neon branches give `dev`, `staging` and `prod`. Use the pooled URL at runtime and the direct URL for migrations. |
| F12 | Québec Law 25 (privacy) | Needs a privacy policy in FR and EN, a named privacy officer, and consent before any non-essential cookies or analytics. Sentry stays essential with PII scrubbing. No marketing pixels in MVP. |

---

## 7. Risks and proposed answers

| # | Risk | Severity | Proposed answer |
|---|------|----------|-----------------|
| R1 | **The brief says "greenfield, nothing to migrate", but `cff-hub` already tracks `courses`, `clients` and `orders` in Supabase**, and its finance views count course revenue. | High | MVP does **not** integrate with the Hub. Platform orders will not appear in Hub finance. **Client decision D7:** accept the split for now, or add a post-MVP read-only export (webhook or CSV) to the Hub. Also confirm that Google Forms data does not need importing. |
| R2 | An existing Shopify store handles cake orders, and the MVP adds a "product catalog (display only)". Two product catalogs will drift. | Medium | The Payload `products` collection is display-only with an optional `externalUrl` ("Order on our shop"). **D8:** confirm the domain layout (for example `cookforfriends.ca` = new platform, `shop.cookforfriends.ca` = Shopify, or the reverse). |
| R3 | The brief says the brand is undefined, but the Hub uses rose `#D4537E`, cream, Cormorant Garamond and DM Sans. | Low | DESIGN_SPEC uses neutral placeholder tokens as instructed. Hub tokens are noted as a candidate. A swap is one file (`tokens.css`). **D4.** |
| R4 | The magic link depends on Payload internals (`jwtSign`, `generatePayloadCookie`). | Medium | Wave 1 integration-test spike before any dependent work. The fallback custom strategy keeps the same module API (§3). Payload version pinned exactly. |
| R5 | Checkout's 30-minute minimum vs the 15-minute hold (F1) creates oversell windows. | High | Hold accounting plus a webhook re-check with auto-refund. A dedicated Vitest race test (two concurrent allocations for the last seat → exactly one hold, against real Postgres) and a Playwright test of the expired-hold refund path. |
| R6 | Webhook re-delivery or concurrency double-grants access. | High | `processed-stripe-events.eventId` UNIQUE, inserted **in the same transaction** as the side effects. Unique constraints on `orders.stripeCheckoutSessionId`, `enrollments(order, session, attendeeIndex)` and `entitlements(customer, course, source, sourceRef)`. A replay test sends every event twice. |
| R7 | Payload admin plus storefront in one Next app hurts Lighthouse. | Medium | Separate route groups `(payload)` and `(frontend)`. Storefront pages are statically generated (ISR) and revalidated by Payload `afterChange` hooks. No Payload client bundles on public pages. Lighthouse CI on staging in Wave 4. |
| R8 | Vercel function size and cold starts with Payload. | Medium | Node runtime (not Edge) for Payload routes. Keep `sharp` external. Neon pooled URL. Measure in the Wave 1 deploy to staging. |
| R9 | The cancellation policy is undefined. | Medium | A configurable `cancellation-policy` global with tiers `[{ minHoursBefore, outcome: 'refund' \| 'credit' \| 'none', percent }]`. Credit is issued as a **single-use personal Stripe promotion code** for the paid amount, so there is no balance ledger in MVP. **D1.** |
| R10 | Seats per purchase (can one customer book 2 seats for a friend?) changes the seat logic, attendee list, emails, refunds and certificates. | High | **D9 resolved 2026-10-19: up to 4 seats per purchase.** One hold row with quantity N allocated all-or-nothing under the session row lock; N enrollments (one per attendee, each its own customer); per-attendee entitlements and emails; whole-order auto-refund when fewer than N seats remain at webhook time; `enrollments.seatAmount` for Wave 3 per-seat partial refunds. Race test: two buyers × quantity 2 for the last 3 seats → exactly one hold. |
| R11 | Waitlist fairness: notify one person or everyone? | Low | MVP: when a seat frees, email the next **N** waitlisters (N configurable, default 3), FIFO. First to pay wins. No reserved hold for waitlisters. **D10.** |
| R12 | Stripe Tax registrations and the tax code are not confirmed. A small supplier under $30k is **not required** to collect GST/QST. | High | **D6:** client confirms GST and QST registration numbers before Wave 2 ends. If not registered, `automatic_tax` stays off behind `STRIPE_TAX_ENABLED`. |
| R13 | Many agents run in parallel on one Next app. | Medium | Strict module folders under `apps/web/src/modules/*` with a public `index.ts`. ESLint `no-restricted-imports` blocks deep imports across modules. CONTRACT.md lists ownership. |
| R14 | A tight timeline or unknown launch date (D5) leads to scope pressure. | Medium | Waves are ordered so that **Wave 2 alone already replaces Google Forms + e-transfer** (in-person purchase end to end). The portal and online courses (Wave 3) can ship after it if needed. |
| R15 | Email deliverability (magic links in spam). | Medium | Resend on a verified domain subdomain (`mail.<domain>`) with SPF, DKIM and DMARC. Blocked until the domain decision (D8). Staging uses a Resend test domain. |

---

## 8. Open decisions (client) — feed SESSION.md blockers

| ID | Decision | Default we build with | Blocks |
|----|----------|-----------------------|--------|
| D1 | Cancellation deadlines and refund vs credit | Configurable global, seeded: ≥72 h refund 100%, 24–72 h credit 100%, <24 h none | Wave 3 cancellation task |
| D2 | Video provider (Mux or Bunny) | Mux adapter first | Wave 3 video task (adapter only) |
| D3 | Community link (WhatsApp, Discord or Skool) | `site-settings.communityUrl` empty → link hidden | Nothing |
| D4 | Brand, photos | Neutral tokens + placeholder images | Launch only |
| D5 | Launch date, number of online courses | — | Wave 4 schedule |
| D6 | GST/QST registration numbers, tax code | `STRIPE_TAX_ENABLED=false` until confirmed | Wave 2 acceptance for receipts |
| D7 | Hub integration of platform orders | None in MVP | Nothing (post-MVP) |
| D8 | Domain layout vs Shopify; sending domain | `*.vercel.app` staging | Production deploy, email deliverability |
| D9 | Seats per purchase | 4 (site-settings) | **Resolved 2026-10-19 (client via Erick): up to 4 seats (site-settings), guest name+email, guest light accounts, per-seat cancellation (Wave 3).** Supersedes the 2026-10-18 "1 seat" decision. `site-settings.maxSeatsPerPurchase` default 4 (staff-editable, hard cap 10). Buyer is always attendee #0; each extra seat needs guest first/last name + email; each guest gets a light customer account (magic-link login), own enrollment, own entitlement, own confirmation email + `.ics` (reminders/certificate in Wave 3). Oversell → whole-order refund. Per-seat cancellation with partial refund/credit per D1 built in Wave 3 (data shape in CONTRACT 1.2, CCR-W2-6). |
| D10 | Waitlist notification strategy | Next 3, FIFO, first to pay wins | Wave 3 waitlist task |
| D11 | Vercel Pro plan (cron frequency) | **Resolved 2026-10-18: Cloudflare Workers Cron (staging).** Revisit Vercel Pro at launch. | Wave 2 staging |

---

## 9. Wave plan summary

The full plan with tasks and owners is in `docs/MASTER_BUILD_SPEC.md` §10.

- **Wave 0 — Discovery** (this doc) ✅ awaiting approval
- **Wave 1 — Foundation:** monorepo scaffold, Payload boot, i18n routing, env schema, CI, staging on Vercel and Neon; all collections and access control; staff auth plus magic-link spike; design tokens and shadcn shell
- **Wave 2 — Commerce core:** Stripe catalog sync, cart, seat holds, Checkout, idempotent webhook, orders, entitlements, enrollments, confirmation emails with `.ics`, storefront pages, attendee list. **Replaces Google Forms + e-transfer.**
- **Wave 3 — Portal & operations:** customer portal, video adapter and player, progress, certificates, comments and moderation, waitlist, reminders, cancellation policy, attendance, PWA, SEO and structured data
- **Wave 4 — Quality & launch:** Playwright purchase flows on Stripe test mode, Lighthouse ≥ 90, Sentry, security review, production deploy (**approval gate**), French admin guide
