---
version: 1.0
status: draft — frozen on Wave 0 approval
owner: orchestrator
---

# CONTRACT — Cook for Friends Platform

Every agent reads this before working. **You may not change another module's surface (exports, collection fields, routes, events) without an orchestrator decision.** To propose a change, write it in your task file under `## Contract Change Request` and stop.

Pins and the reasons for them are in `docs/DISCOVERY.md` §2. Requirements are in `docs/MASTER_BUILD_SPEC.md`.

---

## 1. Module map and ownership

All app code lives in `apps/web/src/`. A module = one folder in `apps/web/src/modules/<name>/` with:
- `collections/*.ts` — Payload collections the module **owns** (only the owner writes these files)
- `index.ts` — the **public surface**. Other modules import **only** from `@/modules/<name>`. Deep imports are blocked by ESLint `no-restricted-imports`.
- `server/*` — internal implementation
- `__tests__/*` — Vitest

| Module | Owns collections / globals | Owns paths (exclusive write) | Agent / model |
|--------|----------------------------|------------------------------|---------------|
| `platform` | — | `/` root configs, `turbo.json`, `pnpm-workspace.yaml`, `packages/*`, `apps/web/{package.json,next.config.ts,tsconfig.json,vercel.json,.env.example}`, `apps/web/src/payload.config.ts`, `apps/web/src/proxy.ts`, `apps/web/src/i18n/*` (except `messages/`), `apps/web/src/lib/{env,db,payload}.ts`, `apps/web/src/app/(payload)/**`, `apps/web/src/app/api/cron/**`, `.github/**` | devops-agent / Sonnet |
| `catalog` | `products`, `courses`, `sessions`, `lessons`, `materials`, `pages`, `media`, globals `site-settings`, `cancellation-policy`, page blocks | `src/modules/catalog/**` | backend-engineer / Sonnet (schema reviewed by Opus) |
| `identity` | `users` (staff), `customers`, `magic-link-tokens` | `src/modules/identity/**`, `src/app/api/auth/**` | backend-engineer / Sonnet |
| `access` | `entitlements` | `src/modules/access/**` | backend-engineer / Sonnet |
| `commerce` | `orders`, `seat-holds`, `enrollments`, `discount-codes`, `processed-stripe-events` | `src/modules/commerce/**`, `src/app/api/{cart,checkout,stripe}/**`, `src/lib/stripe.ts` | backend-engineer / **Opus** for seat + webhook logic |
| `scheduling` | `waitlist-entries` | `src/modules/scheduling/**`, `src/app/api/{waitlist,enrollments}/**` | backend-engineer / Sonnet |
| `learning` | `lesson-progress`, `certificates`, `comments` | `src/modules/learning/**`, `src/app/api/{progress,certificates,comments}/**` | backend-engineer / Sonnet |
| `video` | — | `src/modules/video/**`, `src/app/api/video/**` | backend-engineer / Sonnet |
| `notifications` | — | `src/modules/notifications/**` (React Email templates, `.ics`, send) | backend-engineer / Sonnet |
| `ui` | — | `src/styles/**`, `src/components/ui/**` (shadcn), `src/components/layout/**` | frontend-architect / Sonnet |
| `storefront` | — | `src/app/(frontend)/[locale]/(site)/**`, `src/components/storefront/**`, `src/app/sitemap.ts`, `src/app/robots.ts` | frontend-architect / Sonnet |
| `portal` | — | `src/app/(frontend)/[locale]/account/**`, `src/app/(frontend)/[locale]/auth/**`, `src/components/portal/**`, `src/app/manifest.ts`, `public/sw.js` | frontend-architect / Sonnet |
| `admin-ext` | — | `src/admin/**` (custom Payload admin views/components: session attendees, attendance) | backend-engineer / Sonnet |
| `i18n-messages` | — | `src/i18n/messages/{fr,en}.json` — **shared file**. Each module adds keys only under its own namespace (`catalog.*`, `commerce.*`, …). Never edit another namespace. | all |
| `quality` | — | `apps/web/e2e/**`, `apps/web/test/**` (shared fixtures, db test helpers), `lighthouserc.json` | tester / e2e-runner / Sonnet |

`payload.config.ts` (owned by `platform`) imports collections **only** through each module's exported array:
`import { catalogCollections, catalogGlobals } from '@/modules/catalog'`. Adding a collection to your own module does not require touching `payload.config.ts`.

Routine lint, format or rename fixes in any path → Haiku, after an orchestrator OK.

---

## 2. Shared types (canonical)

Generated Payload types (`src/payload-types.ts`) are the source of truth for documents. The domain types below are **module return types** and must not leak Payload internals.

```ts
// src/modules/_shared/types.ts  (owned by platform, read-only for all)
export type Locale = 'fr' | 'en'
export type ID = string | number            // Payload id (postgres: number)
export type ISODate = string
export type Money = { amount: number; currency: 'cad' }  // amount in cents

export type CourseFormat = 'in_person' | 'online'
export type EntitlementSource = 'purchase' | 'gift' | 'manual' | 'membership'

export type ModuleError =
  | { code: 'NOT_FOUND'; entity: string }
  | { code: 'FORBIDDEN' }
  | { code: 'SOLD_OUT'; sessionId: ID }
  | { code: 'HOLD_EXPIRED'; holdId: ID }
  | { code: 'VALIDATION'; issues: { path: string; message: string }[] }
  | { code: 'CONFLICT'; reason: string }
  | { code: 'UPSTREAM'; service: 'stripe' | 'resend' | 'video'; message: string }

export type Result<T> = { ok: true; data: T } | { ok: false; error: ModuleError }
```

Every route handler maps `ModuleError` → HTTP status and a **localized** message key (`errors.<code>`). Error envelope:

```ts
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: ModuleError['code']; messageKey: string; details?: unknown } }
```

---

## 3. Data model (collections)

`L` = localized field. All collections have `createdAt` and `updatedAt`. Indexes are listed explicitly where they matter for correctness.

### 3.1 catalog
| Collection | Key fields |
|------------|-----------|
| `courses` | `title` L, `slug` L unique, `format: CourseFormat`, `summary` L, `description` L (lexical), `level: 'beginner'\|'intermediate'\|'advanced'`, `durationMinutes`, `price: number` (cents, CAD, tax-exclusive), `heroImage → media`, `gallery[] → media`, `lessons[] → lessons` (online, ordered), `materials[] → materials`, `status: 'draft'\|'published'\|'archived'` (Payload drafts enabled), `stripeProductId` (readonly), `stripePriceId` (readonly), `stripeSyncStatus: 'pending'\|'synced'\|'error'`, `stripeSyncError`, `seo { title L, description L, image }`, `certificateEnabled: boolean` |
| `sessions` | `course → courses` (in_person only), `startsAt`, `endsAt` (stored UTC, displayed America/Toronto), `location { name, address, city, postalCode, mapsUrl }` L name, `level` (override), `capacity: int ≥ 1`, `status: 'scheduled'\|'cancelled'\|'completed'`, `notes` L. Index `(course, startsAt)` |
| `lessons` | `course → courses`, `title` L, `order: int`, `body` L (lexical), `video { provider: 'mux'\|'bunny', assetId, playbackId?, durationSec }` (no URLs), `materials[] → materials`, `isPreview: boolean` (free preview, still no public video URL — preview uses a signed URL too) |
| `materials` | `title` L, `file → media` (private bucket prefix), `kind: 'recipe'\|'pdf'\|'other'`, `locale?: Locale` |
| `products` | `title` L, `slug` L, `description` L, `images[] → media`, `priceDisplay` L (text), `externalUrl?`, `status` — **display only** |
| `pages` | `title` L, `slug` L, `layout: Block[]` (blocks: `hero`, `gallery`, `testimonials`, `cta`, `richText`), `seo` |
| `media` | upload to R2. `alt` L. `access.read`: public for images; `materials` files are served via the signed route `/api/materials/:id` (access-checked) |
| global `site-settings` | `communityUrl?`, `maxSeatsPerPurchase` (default 1), `holdMinutes` (default 15), `waitlistNotifyCount` (default 3), `reminderOffsetsHours` (default `[48, 24]`), `contactEmail`, `legal { termsPage, privacyPage, cancellationPage }` |
| global `cancellation-policy` | `tiers: { minHoursBefore: number; outcome: 'refund'\|'credit'\|'none'; percent: number }[]` sorted desc, `customerCanSelfCancel: boolean` |

### 3.2 identity
| Collection | Key fields |
|------------|-----------|
| `users` (auth, local strategy) | `name`, `role: 'admin'\|'staff'`. `admin.user` collection |
| `customers` (auth, `disableLocalStrategy: true`, custom strategy) | `email` unique, `firstName`, `lastName`, `phone?`, `preferredLocale: Locale` (default `fr`), `stripeCustomerId?`, `marketingConsent: boolean` (Law 25), `dietaryNotes?` |
| `magic-link-tokens` | `customer → customers`, `tokenHash` unique, `expiresAt`, `usedAt?`, `requestIp`, `next?`. Admin-hidden |

### 3.3 access
| Collection | Key fields |
|------------|-----------|
| `entitlements` | `customer → customers`, `course → courses`, `source: EntitlementSource`, `sourceRef: string` (orderId \| userId \| giftId \| membershipId), `validFrom`, `validUntil?` (null = no expiry), `revokedAt?`, `revokedReason?`, `grantedBy → users?`. **UNIQUE `(customer, course, source, sourceRef)`** |

### 3.4 commerce
| Collection | Key fields |
|------------|-----------|
| `orders` | `number` (human, `CFF-000123`), `customer → customers`, `email`, `locale`, `status: 'pending'\|'paid'\|'refunded'\|'partially_refunded'\|'cancelled'`, `items: { course, session?, quantity, unitAmount, description }[]`, `subtotal`, `discountTotal`, `taxGst`, `taxQst`, `total`, `currency: 'cad'`, `stripeCheckoutSessionId` **UNIQUE**, `stripePaymentIntentId?`, `stripeInvoiceId?`, `invoicePdfUrl?`, `promotionCode?`, `paidAt?`, `refunds: { stripeRefundId, amount, reason, at }[]` |
| `seat-holds` | `session → sessions`, `quantity`, `cartToken`, `customerEmail?`, `stripeCheckoutSessionId?`, `status: 'active'\|'converted'\|'expired'\|'released'`, `expiresAt`. Index `(session, status, expiresAt)` |
| `enrollments` | `session → sessions`, `customer → customers`, `order → orders`, `attendeeIndex: int` (0..quantity-1), `attendeeName?`, `status: 'confirmed'\|'cancelled'\|'refunded'`, `attendance: 'unknown'\|'present'\|'absent'`, `cancelledAt?`, `cancellationOutcome?`. **UNIQUE `(order, session, attendeeIndex)`** |
| `discount-codes` | `code` unique, `kind: 'percent'\|'amount'`, `value`, `maxRedemptions?`, `expiresAt?`, `appliesTo[] → courses?`, `active`, `stripeCouponId`, `stripePromotionCodeId`, `personalFor → customers?` (credits) |
| `processed-stripe-events` | `eventId` **UNIQUE**, `type`, `processedAt`, `outcome: 'applied'\|'skipped'\|'refunded'\|'error'`, `note?` |

### 3.5 scheduling
| `waitlist-entries` | `session`, `customer?`, `email`, `locale`, `status: 'waiting'\|'notified'\|'converted'\|'expired'\|'removed'`, `notifiedAt?`. UNIQUE `(session, email)` |

### 3.6 learning
| Collection | Key fields |
|------------|-----------|
| `lesson-progress` | `customer`, `lesson`, `course`, `completed: boolean`, `completedAt?`, `positionSec`. **UNIQUE `(customer, lesson)`** |
| `certificates` | `customer`, `course`, `verificationCode` UNIQUE (10 chars Crockford base32), `issuedAt`, `locale`, `customerNameSnapshot`, `courseTitleSnapshot { fr, en }`. UNIQUE `(customer, course)` |
| `comments` | `lesson`, `customer`, `body` (plain text ≤ 2000), `status: 'pending'\|'approved'\|'rejected'`, `moderatedBy → users?`, `parent → comments?` (one level) |

### 3.7 Access control matrix (Payload `access`)
| Collection | Public | Customer | Staff | Admin |
|-----------|--------|----------|-------|-------|
| courses, sessions, products, pages, media (images) | read published | read published | CRUD | CRUD |
| lessons, materials | — (only via module functions) | — (only via module functions) | CRUD | CRUD |
| customers | — | read/update self (no email change in MVP) | read, update | CRUD |
| users | — | — | read self | CRUD |
| entitlements | — | read own | read, create `manual` | CRUD |
| orders | — | read own | read | read, update |
| enrollments | — | read own | read, update attendance | CRUD |
| seat-holds, processed-stripe-events, magic-link-tokens | — | — | read | read |
| comments | read `approved` | create, read approved + own | moderate | CRUD |
| lesson-progress, certificates | — | read own (writes only via module) | read | CRUD |

---

## 4. Module public surfaces (`index.ts` exports)

Signatures are binding. Implementations may add internals but not change these.

```ts
// @/modules/catalog
export const catalogCollections: CollectionConfig[]
export const catalogGlobals: GlobalConfig[]
export function getPublishedCourse(slug: string, locale: Locale): Promise<CourseView | null>
export function listPublishedCourses(locale: Locale, filter?: { format?: CourseFormat }): Promise<CourseCard[]>
export function getSessionWithAvailability(sessionId: ID): Promise<SessionView | null>  // uses commerce.getAvailableSeats
export function getSiteSettings(): Promise<SiteSettings>
export function getCancellationPolicy(): Promise<CancellationPolicy>

// @/modules/identity
export const identityCollections: CollectionConfig[]
export function requestMagicLink(i: { email: string; locale: Locale; next?: string; ip: string }): Promise<Result<void>>
export function verifyMagicLink(token: string): Promise<Result<{ customerId: ID; setCookie: string; next: string }>>
export function getCurrentCustomer(headers: Headers): Promise<CustomerView | null>
export function requireCustomer(headers: Headers): Promise<CustomerView>              // throws → redirect to /{locale}/auth/login
export function upsertCustomerByEmail(i: { email: string; locale: Locale; firstName?: string; lastName?: string }): Promise<CustomerView>
export function isStaff(user: unknown): boolean

// @/modules/access
export const accessCollections: CollectionConfig[]
export function hasActiveEntitlement(customerId: ID, courseId: ID, at?: Date): Promise<boolean>
export function listActiveEntitlements(customerId: ID): Promise<EntitlementView[]>
export function grantEntitlement(i: { customerId: ID; courseId: ID; source: EntitlementSource; sourceRef: string; validFrom?: Date; validUntil?: Date | null; grantedBy?: ID; tx?: TxContext }): Promise<Result<EntitlementView>> // idempotent on unique key
export function revokeEntitlement(i: { customerId: ID; courseId: ID; source: EntitlementSource; sourceRef: string; reason: string; tx?: TxContext }): Promise<Result<void>>

// @/modules/commerce
export const commerceCollections: CollectionConfig[]
export function getAvailableSeats(sessionId: ID, tx?: TxContext): Promise<number>
export function createCheckout(i: { cart: CartLine[]; locale: Locale; customerEmail?: string; cartToken: string }): Promise<Result<{ checkoutUrl: string; holdIds: ID[]; holdExpiresAt: ISODate }>>
export function handleStripeEvent(rawBody: string, signature: string): Promise<Result<{ outcome: 'applied' | 'skipped' | 'refunded' }>>
export function refundOrder(i: { orderId: ID; amount?: number; reason: string }): Promise<Result<void>>
export function issueCreditCode(i: { customerId: ID; amount: number; reason: string }): Promise<Result<{ code: string }>>
export function expireStaleHolds(now?: Date): Promise<{ expired: number; checkoutSessionsExpired: number }>
export function listAttendees(sessionId: ID): Promise<AttendeeRow[]>
export function syncCourseToStripe(courseId: ID): Promise<Result<{ productId: string; priceId: string }>>  // called by catalog afterChange hook via job
export type CartLine = { courseId: ID; sessionId?: ID; quantity: number }

// @/modules/scheduling
export const schedulingCollections: CollectionConfig[]
export function joinWaitlist(i: { sessionId: ID; email: string; locale: Locale }): Promise<Result<void>>
export function onSeatReleased(sessionId: ID): Promise<void>
export function cancelEnrollment(i: { enrollmentId: ID; by: 'customer' | 'staff' }): Promise<Result<{ outcome: 'refund' | 'credit' | 'none'; amount: number }>>
export function sendDueReminders(now?: Date): Promise<{ sent: number }>
export function markAttendance(i: { enrollmentId: ID; attendance: 'present' | 'absent'; staffId: ID }): Promise<Result<void>>

// @/modules/learning
export const learningCollections: CollectionConfig[]
export function getCoursePlayer(customerId: ID, courseSlug: string, locale: Locale): Promise<Result<CoursePlayerView>> // FORBIDDEN without entitlement
export function recordProgress(i: { customerId: ID; lessonId: ID; completed?: boolean; positionSec?: number }): Promise<Result<{ courseCompleted: boolean }>>
export function issueCertificateIfComplete(customerId: ID, courseId: ID): Promise<Result<CertificateView | null>>
export function renderCertificatePdf(certificateId: ID, locale: Locale): Promise<Buffer>
export function verifyCertificate(code: string): Promise<CertificatePublicView | null>
export function postComment(i: { customerId: ID; lessonId: ID; body: string; parentId?: ID }): Promise<Result<void>>

// @/modules/video
export interface VideoProvider { /* see DISCOVERY §5 */ }
export function getVideoProvider(): VideoProvider
export function getLessonPlayback(i: { customerId: ID; lessonId: ID }): Promise<Result<{ url: string; posterUrl?: string; expiresAt: ISODate }>> // checks entitlement via access

// @/modules/notifications
export type EmailTemplate =
  | 'magic-link' | 'order-confirmation' | 'enrollment-confirmation' | 'reminder'
  | 'waitlist-seat-available' | 'cancellation-confirmation' | 'refund-issued'
  | 'oversell-refund' | 'certificate-issued' | 'comment-approved'
export function sendEmail<T extends EmailTemplate>(i: { template: T; to: string; locale: Locale; data: EmailData[T]; attachments?: Attachment[]; idempotencyKey: string }): Promise<Result<{ id: string }>>
export function buildIcs(i: { uid: string; title: string; description: string; location: string; startsAt: Date; endsAt: Date; url: string }): string
```

`TxContext` = `{ req: PayloadRequest }` carrying Payload's `transactionID`. Raw SQL locks run on the same transaction.

---

## 5. Routes

### 5.1 HTTP API (Next route handlers, `src/app/api/**`)
| Method & path | Owner | Auth | Body / query → response |
|---------------|-------|------|--------------------------|
| `POST /api/auth/magic-link/request` | identity | public, rate-limited (5/email/h, 20/IP/h) | `{ email, locale, next? }` → `200 { ok: true }` always |
| `POST /api/auth/magic-link/verify` | identity | public | `{ token }` → `303` + `Set-Cookie` → `next` |
| `POST /api/auth/logout` | identity | customer | → `303 /{locale}` |
| `POST /api/checkout` | commerce | public (cart token cookie) | `{ lines: CartLine[], locale, email? }` → `{ checkoutUrl, holdExpiresAt }` \| `409 SOLD_OUT` |
| `POST /api/stripe/webhook` | commerce | Stripe signature | raw body → `200` (also on duplicate) |
| `POST /api/waitlist` | scheduling | public | `{ sessionId, email, locale }` → `200` |
| `POST /api/enrollments/:id/cancel` | scheduling | customer (owner) or staff | → `{ outcome, amount }` |
| `GET /api/video/playback?lessonId=` | video | customer + entitlement | → `{ url, posterUrl?, expiresAt }` \| `403` |
| `POST /api/progress` | learning | customer + entitlement | `{ lessonId, completed?, positionSec? }` → `{ courseCompleted }` |
| `GET /api/certificates/:id/pdf?locale=` | learning | customer (owner) | → `application/pdf` |
| `POST /api/comments` | learning | customer + entitlement | `{ lessonId, body, parentId? }` → `201` (status pending) |
| `GET /api/materials/:id` | catalog | customer + entitlement for any course containing it | → `302` to signed R2 URL (TTL 5 min) |
| `GET /api/sessions/:id/attendees.csv` | commerce | staff | → `text/csv` (UTF-8 BOM for Excel FR) |
| `GET /api/orders/:id/receipt` | commerce | customer (owner) or staff | → `302` to Stripe invoice PDF |
| `GET /api/cron/expire-holds` | platform → commerce.expireStaleHolds | `Authorization: Bearer CRON_SECRET` | every 5 min |
| `GET /api/cron/reminders` | platform → scheduling.sendDueReminders | CRON_SECRET | hourly |
| `GET /api/cron/jobs` | platform → `payload.jobs.run()` | CRON_SECRET | every 5 min |

### 5.2 Pages (`src/app/(frontend)/[locale]/…`, translated pathnames)
| Route (fr / en) | Owner |
|-----------------|-------|
| `/` | storefront |
| `/cours` / `/courses`, `/cours/[slug]` / `/courses/[slug]` | storefront |
| `/produits` / `/products`, `/produits/[slug]` | storefront |
| `/[...slug]` (Payload pages) | storefront |
| `/panier` / `/cart`, `/commande/merci` / `/checkout/success`, `/commande/annulee` / `/checkout/cancelled` | storefront |
| `/certificats/verifier/[code]` / `/certificates/verify/[code]` | storefront |
| `/connexion` / `/auth/login`, `/connexion/verifier` / `/auth/verify` | portal |
| `/compte` / `/account` (dashboard), `/compte/cours/[slug]` (player), `/compte/cours/[slug]/[lesson]`, `/compte/sessions`, `/compte/historique`, `/compte/recus`, `/compte/profil` | portal |
| `/admin/**` | Payload (platform) + admin-ext custom views |

### 5.3 Stripe ↔ Payload sync (one-way: Payload → Stripe)
- `courses.afterChange` (status published, or price/title changed) → enqueue job `stripe-sync-course` → `commerce.syncCourseToStripe`. Product upserted with `metadata.payloadCourseId`. If the price changed: new Price, set `default_price`, archive the old one. `stripeSyncStatus` is written back with `context.skipStripeSync = true` to avoid loops.
- `discount-codes.afterChange` → job `stripe-sync-discount` → Coupon + Promotion Code. Deactivating in Payload deactivates in Stripe.
- Course archived → Product `active=false`.

---

## 6. Webhook events (Stripe → `/api/stripe/webhook`)

Processing envelope (applies to every event):
1. Verify the signature with `STRIPE_WEBHOOK_SECRET` on the **raw** body.
2. Open a Payload transaction. `INSERT processed-stripe-events(eventId)`. On a unique violation → commit nothing, return `200 { outcome: 'skipped' }`.
3. Apply the handler in the same transaction. Emails are **enqueued as jobs** inside the transaction and sent after commit, so a rollback never sends an email.
4. Handler throws → rollback (the event row disappears too) → return `500` → Stripe retries.

| Event | Handler |
|-------|---------|
| `checkout.session.completed` (`payment_status = paid`) | Upsert customer by email → create Order `paid` (unique on session ID). For each session line: `SELECT … FOR UPDATE` on the session row; hold valid → convert hold → create enrollments; hold expired and seats remain → create enrollments anyway; hold expired and **no seats** → `refundOrder` (that line or the whole order) + `oversell-refund` email, outcome `refunded`. For each course: `access.grantEntitlement({ source: 'purchase', sourceRef: orderId })`. Enqueue `order-confirmation` (+ `.ics` per session) with a magic link for guest customers. |
| `checkout.session.async_payment_succeeded` | Same as completed. |
| `checkout.session.async_payment_failed` | Release holds, order `cancelled`. |
| `checkout.session.expired` | Holds → `released`. `scheduling.onSeatReleased(session)`. |
| `charge.refunded` | Update `order.refunds`, set the status. Full refund → revoke purchase entitlements + cancel enrollments → `onSeatReleased`. |
| `invoice.finalized` | Store `stripeInvoiceId` and `invoicePdfUrl` on the order (receipts). |

Internal jobs (Payload Jobs Queue, task slugs): `stripe-sync-course`, `stripe-sync-discount`, `send-email`, `waitlist-notify`, `issue-certificate`.

---

## 7. DB ownership rules

- Only the owning module writes its collections — through Payload Local API or, in `commerce` only, raw SQL for locks. Other modules call the owner's `index.ts`.
- Reading another module's collection via Payload Local API is allowed **only** in server components for display (read-only). Writes are never allowed.
- Schema changes = a Payload migration generated by the owning module's agent (`pnpm payload migrate:create <module>-<change>`). Migrations are reviewed by the orchestrator (Opus) before merge.
- No `push: true` outside local dev.

---

## 8. Change log
| Date | Version | Change | By |
|------|---------|--------|----|
| 2026-10-07 | 1.0-draft | Initial contract from Wave 0 discovery | orchestrator |
