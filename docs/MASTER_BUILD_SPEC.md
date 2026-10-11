# MASTER BUILD SPEC — Cook for Friends Platform

Living requirements. Seeded on 2026-10-07 from the client brief, sections 5–9. Change only via orchestrator decision. Log changes in §12.

**Mission.** A bilingual (FR/EN) web platform where a Montréal pastry and baking-class business sells baking courses (in person and online). Customers get a portal with their courses, progress, materials and community access. It replaces registration through Google Forms and payment by e-transfer. Greenfield: no data to migrate.

Interfaces and ownership → `docs/CONTRACT.md`. Versions and risks → `docs/DISCOVERY.md`. UI rules → `docs/DESIGN_SPEC.md`.

---

## 1. Stack (brief §5)

| Layer | Choice |
|-------|--------|
| Repo | Turborepo + pnpm monorepo. `apps/web` now, room for `apps/mobile` (Expo) later |
| App | Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui |
| CMS and admin | Payload CMS 3 running inside `apps/web` |
| Database | Postgres on Neon via the Payload Postgres adapter |
| Auth | Payload Auth: staff password, customer magic link |
| Payments | Stripe Checkout (one-time payments), Stripe Tax (GST/QST), webhooks |
| Video | Provider-agnostic interface, signed expiring playback URLs |
| Media storage | S3-compatible (Cloudflare R2) |
| Email | Resend + React Email, FR/EN templates |
| i18n | next-intl for UI, Payload localization for content. **FR is the default locale** |
| Hosting | Vercel, staging and production |
| Quality | Vitest, Playwright for purchase flows, Sentry |

Exact pins are in DISCOVERY §2.

## 2. Repository layout

```
CookForFriends/
├── CLAUDE.md                     # slim behavior contract
├── docs/                         # memory layer (this file, CONTRACT, DESIGN_SPEC, SESSION, DISCOVERY, admin guide FR)
├── tasks/                        # one file per task (W<wave>-<nn>-<slug>.md)
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (frontend)/[locale]/(site)/…    # storefront
│       │   │   ├── (frontend)/[locale]/account/…   # portal
│       │   │   ├── (frontend)/[locale]/auth/…      # magic link pages
│       │   │   ├── (payload)/admin/…               # Payload admin
│       │   │   ├── (payload)/api/…                 # Payload REST
│       │   │   └── api/…                           # custom route handlers (CONTRACT §5.1)
│       │   ├── modules/{catalog,identity,access,commerce,scheduling,learning,video,notifications,_shared}/
│       │   ├── admin/                              # custom Payload admin components
│       │   ├── components/{ui,layout,storefront,portal}/
│       │   ├── i18n/{locales.ts,routing.ts,request.ts,navigation.ts,messages/{fr,en}.json}
│       │   ├── lib/{env.ts,db.ts,payload.ts,stripe.ts}
│       │   ├── styles/{tokens.css,globals.css}
│       │   ├── payload.config.ts
│       │   └── proxy.ts
│       ├── e2e/                                    # Playwright
│       └── test/                                   # Vitest helpers, db fixtures
├── packages/
│   ├── tsconfig/                                   # shared tsconfig bases
│   └── eslint-config/                              # shared lint incl. module-boundary rule
├── turbo.json
└── pnpm-workspace.yaml
```

## 3. MVP scope (brief §6)

### 3.1 Storefront
- Public site in FR and EN with locale-prefixed URLs (`/fr/…`, `/en/…`).
- Landing page and content pages built from Payload blocks.
- Product catalog: **display only, no ordering in MVP.**
- Course catalog, course detail, cart and checkout for courses.
- SEO: metadata, sitemap, structured data for courses (`Course`) and events (`Event` for in-person sessions).

### 3.2 CMS and admin (Payload)
- Collections: products, courses, sessions, lessons, materials, pages, media, users.
- Page builder blocks: hero, gallery, testimonials, CTA, rich text.
- Session view with enrollments, exportable attendee list and attendance marking.
- Roles: admin, staff, customer (see DISCOVERY §3 for how these map to collections).

### 3.3 Payments
- One-time payment per course via Stripe Checkout.
- Stripe Tax for GST/QST.
- Publishing a course in Payload creates or updates its Stripe Product and Price automatically.
- Discount codes.
- The webhook confirms payment, creates the Order, grants the Entitlement, creates the Enrollment for in-person sessions, and sends the confirmation email.

### 3.4 In-person courses
- Sessions with date, time, location, level and capacity.
- 15-minute SeatHold during checkout. Expired holds release the seat.
- Waitlist, with an email when a seat frees up.
- Reminder emails at 48 h and 24 h with a calendar invite (`.ics`).
- Cancellation policy enforced by the system: credit or refund depending on the deadline. The exact policy is pending, so it must be configurable.
- Attendance recorded by staff.

### 3.5 Customer portal
- Magic-link login, profile, preferred language.
- My courses: online courses owned, upcoming and past sessions.
- Online course player: protected video, text, downloadable recipes and PDFs, per-lesson progress.
- History of completed courses and a downloadable completion certificate with a verification code.
- Comments per lesson with staff moderation.
- Link to the external community group.
- Receipts and invoices.
- Installable PWA (no native app).

## 4. Domain rules (brief §7) — inviolable

1. **Access is decoupled from payment.** The portal checks only for a valid `Entitlement(user, course, source, validFrom, validUntil)`. Sources: `purchase`, `gift`, `manual`, `membership`. Only `purchase` and `manual` are used in MVP, but the model supports all four so a future membership needs no refactor.
2. **Webhooks are idempotent.** Processed Stripe event IDs are stored. Re-delivery never double-grants access or double-books a seat.
3. **No overselling.** Seat allocation is transactional. Two simultaneous checkouts for the last seat result in exactly one enrollment. The webhook re-validates capacity and refunds automatically if a hold expired and the seat is gone.
4. **Video is never public.** Playback URLs are signed, short-lived and issued only to users with an Entitlement.
5. **Stripe is not the admin.** The client never needs to log into Stripe to manage courses or prices. (A one-time Stripe onboarding for tax registrations is the exception, see D6.)
6. **Everything customer-facing exists in FR and EN**, including emails, certificates and error messages.

**Core entities:** User, Product, Course, Session, Lesson, Material, Order, Entitlement, SeatHold, Enrollment, Waitlist, LessonProgress, Certificate, Comment, ProcessedStripeEvent. Supporting entities added in Wave 0: Customer (split from User, see DISCOVERY §3), MagicLinkToken, DiscountCode, globals SiteSettings and CancellationPolicy.

## 5. Out of scope (brief §8) — flag any drift

Cake ordering with delivery zones and scheduling · CRM · financial dashboard · membership billing · gift cards · native community features · social media automation · AI assistant · native mobile app.

An agent that finds its task drifting into any of these stops and writes `DRIFT:` in its task file.

## 6. Open decisions (brief §9 + Wave 0)

Build so these can be decided late without rework. List them in `docs/SESSION.md` as blockers when they become blocking.

| ID | Decision | Mechanism that keeps it late-bindable |
|----|----------|----------------------------------------|
| D1 | Cancellation deadlines; credit vs refund | `cancellation-policy` global (tiers) |
| D2 | Video provider: Mux or Bunny Stream | `VideoProvider` interface + `VIDEO_PROVIDER` env flag. Mux adapter first |
| D3 | Community group link (WhatsApp, Discord or Skool) | `site-settings.communityUrl` |
| D4 | Brand, domain, photos | `styles/tokens.css` placeholders (DESIGN_SPEC) |
| D5 | Launch date, number of online courses ready | Wave ordering (Wave 2 is shippable alone) |
| D6 | GST/QST registration numbers + tax code | `STRIPE_TAX_ENABLED` flag |
| D7 | Hub (cff-hub) integration | None in MVP |
| D8 | Domain layout vs Shopify store, email sending domain | Env `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM` |
| D9 | Seats per purchase | `site-settings.maxSeatsPerPurchase` (default 1) |
| D10 | Waitlist notification strategy | `site-settings.waitlistNotifyCount` |
| D11 | Vercel Pro (cron frequency) | — |

## 7. Environment variables

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon pooled connection (runtime) |
| `DATABASE_URL_DIRECT` | Neon direct connection (migrations) |
| `PAYLOAD_SECRET` | Payload JWT and encryption secret |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `STRIPE_TAX_ENABLED` | `true` once GST/QST are registered (D6) |
| `STRIPE_TAX_CODE` | Tax code for courses |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Email |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Media storage |
| `VIDEO_PROVIDER` | `mux` \| `bunny` |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`, `MUX_WEBHOOK_SECRET` | If Mux |
| `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_TOKEN_KEY`, `BUNNY_CDN_HOST` | If Bunny |
| `CRON_SECRET` | Vercel Cron auth |
| `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Monitoring |

All env vars are validated at boot by `src/lib/env.ts` (zod). Never commit `.env*` except `.env.example`.

## 8. Non-functional requirements
- Storefront Lighthouse ≥ 90 for performance and accessibility (mobile profile) on home, course list and course detail.
- WCAG 2.2 AA on storefront and portal.
- Core Web Vitals: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- All money in integer cents, CAD. All times stored UTC, displayed `America/Toronto`.
- Security: CSP, HSTS, rate limiting on auth and checkout, no secrets in client bundles, CSRF-safe POST routes (SameSite=Lax cookies + Origin check).
- Privacy: Québec Law 25 (privacy policy FR/EN, consent banner only if non-essential cookies are introduced).

## 9. Acceptance criteria — Definition of Done (brief §10)

- [ ] A customer buys an in-person course, receives confirmation with a calendar invite, and appears on the attendee list.
- [ ] Two simultaneous purchases of the last seat never oversell (covered by an automated test).
- [ ] A customer buys an online course, logs in with a magic link and sees only the courses they are entitled to.
- [ ] Lesson progress persists and a certificate is generated on completion.
- [ ] Videos cannot be played outside an authenticated, entitled session.
- [ ] Staff create and publish a course in Payload with no developer help, and it appears in Stripe and on the site.
- [ ] The site and all emails are available in FR and EN.
- [ ] Receipts show GST and QST correctly.
- [ ] Storefront Lighthouse 90+ on performance and accessibility.
- [ ] Playwright covers both purchase flows end to end against Stripe test mode.
- [ ] Staging and production are deployed on Vercel. A French admin usage guide exists in `docs/`.

## 10. Wave plan

Gate between waves: the orchestrator reviews, updates `docs/SESSION.md`, reports to Erick. **Explicit approval is required after Wave 0 and before any production deploy.**

### Wave 0 — Discovery ✅ (awaiting approval)
`docs/DISCOVERY.md`, `docs/CONTRACT.md` v1.0-draft, this file, `docs/DESIGN_SPEC.md`, `docs/SESSION.md`, `CLAUDE.md`, Wave 1 task briefs.

### Wave 1 — Foundation
| Task | Agent · model | Depends on | Output |
|------|---------------|------------|--------|
| W1-01 platform-scaffold | devops-agent · Sonnet | — | Turborepo + pnpm, `apps/web` Next 16.3.8 + Payload 3.90.2 boots, next-intl routing + `proxy.ts`, env schema, module skeletons with boundary lint, Vitest + Playwright configured, CI (lint/typecheck/test), Neon dev/staging branches, Vercel staging deploy |
| W1-02 data-model | backend-engineer · **Opus** | W1-01 | Every collection and global in CONTRACT §3 with access control, indexes, unique constraints, initial migration, seed script (FR/EN demo content) |
| W1-03 identity-auth | backend-engineer · Sonnet | W1-01, W1-02 (identity collections only) | Staff password auth, customer magic link (request/verify/logout), integration tests proving cookie + `payload.auth` |
| W1-04 ui-foundation | frontend-architect · Sonnet | W1-01 | `tokens.css`, Tailwind v4 `@theme`, shadcn/ui install, layout shell (header, locale switcher, footer), base components per DESIGN_SPEC |

W1-02 and W1-04 run in parallel after W1-01. W1-03 starts once W1-02 has merged the identity collections.

### Wave 2 — Commerce core (replaces Google Forms + e-transfer)
| Task | Agent · model |
|------|---------------|
| W2-01 stripe-catalog-sync (courses + discount codes → Stripe) | backend-engineer · Sonnet |
| W2-02 seat-holds-checkout (availability, holds, `createCheckout`, oversell race test) | backend-engineer · **Opus** |
| W2-03 stripe-webhook (idempotent envelope, orders, entitlements, enrollments, auto-refund, replay tests) | backend-engineer · **Opus** |
| W2-04 notifications (React Email FR/EN, `.ics`, send job) | backend-engineer · Sonnet |
| W2-05 storefront (home/pages blocks, course list/detail, session picker, cart, checkout success/cancel) | frontend-architect · Sonnet |
| W2-06 admin-attendees (session view, CSV export) | backend-engineer · Sonnet |

### Wave 3 — Portal & operations
| Task | Agent · model |
|------|---------------|
| W3-01 portal-shell (login pages, dashboard, my courses, sessions, history, receipts, profile + preferred language, community link) | frontend-architect · Sonnet |
| W3-02 video-adapter (interface, Mux adapter, playback route, admin upload field) | backend-engineer · Sonnet |
| W3-03 learning (player view, progress, certificate issue + PDF + verify page, materials route) | backend-engineer · Sonnet + frontend-architect · Sonnet |
| W3-04 comments-moderation | backend-engineer · Sonnet |
| W3-05 scheduling-ops (waitlist, reminders 48 h/24 h, cancellation policy + credit codes, attendance marking) | backend-engineer · Sonnet |
| W3-06 seo-pwa (metadata, sitemap, JSON-LD Course/Event, manifest + service worker) | frontend-architect · Sonnet |

### Wave 4 — Quality & launch
| Task | Agent · model |
|------|---------------|
| W4-01 e2e-purchase-flows (Playwright, Stripe test mode, both flows + expired-hold refund) | e2e-runner · Sonnet |
| W4-02 perf-a11y (Lighthouse CI ≥ 90, axe) | performance-optimizer · Sonnet |
| W4-03 security-review (auth, webhook, video, access control) | security-reviewer · Opus |
| W4-04 observability (Sentry, PII scrubbing, alerts on webhook errors) | devops-agent · Sonnet |
| W4-05 admin-guide-fr (`docs/GUIDE_ADMIN_FR.md`) | doc-updater · Sonnet |
| W4-06 production-deploy — **APPROVAL GATE** | devops-agent · Sonnet |

Model routing: Opus for architecture, data model, contract, seat and webhook logic, security review. Sonnet for module implementation. Haiku for lint fixes, renames, translation key sync and other repetitive edits.

## 11. Testing strategy
- **Unit (Vitest):** pure logic (policy tier evaluation, price/tax mapping, ICS builder, token hashing, code generation).
- **Integration (Vitest + real Postgres):** a local Docker Postgres or a Neon branch per CI run. Covers the seat race (`Promise.all` of two allocations on capacity-1 session → exactly one success), webhook replay (each event delivered twice), entitlement checks, magic-link verify.
- **E2E (Playwright):** in-person purchase → confirmation → attendee list; online purchase → magic link → player shows only entitled course; expired-hold refund path. Stripe test mode with `stripe listen` forwarding in CI.
- Coverage target 80% on `modules/**`.

## 12. Change log
| Date | Change | By |
|------|--------|----|
| 2026-10-07 | Seeded from brief §5–9; wave plan, env, testing added | orchestrator |
