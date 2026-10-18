---
type: task
id: W1-03
status: complete
wave: 1
module: identity
agent: backend-engineer
model: sonnet
depends-on: [W1-01, W1-02]
---

# W1-03 — Identity: staff auth and customer magic link

## Mission
Make staff password login work in `/admin` and implement the customer magic-link flow end to end at the API level. Prove it with integration tests before any portal UI exists.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md`
3. `docs/DISCOVERY.md` §3 (full flow, fallback plan)
4. `docs/CONTRACT.md` §3.2, §4 `@/modules/identity`, §5.1 auth routes
5. `docs/MASTER_BUILD_SPEC.md` §8 (security)

## Acceptance criteria
- [x] Staff log in at `/admin` with email + password. A `customers` JWT/cookie gets 403 at `/admin`.
- [x] `POST /api/auth/magic-link/request` returns `200 {ok:true}` for both existing and new emails (same body and similar timing). It upserts the customer and stores **only** a SHA-256 token hash with a 15-min expiry. The token is 32 random bytes, base64url.
- [x] Rate limits: 5 requests per email per hour and 20 per IP per hour. Excess requests return `429` with a localized message key. The store is a Postgres table (not in-memory), since serverless instances do not share memory.
- [x] `notifications` is not built yet. Call an internal `sendMagicLinkEmail` port defined in `identity/server/ports.ts`; W2-04 wires the real template. Until then the port sends a plain FR/EN Resend email (subject + link). **Not a mock:** it really sends.
- [x] `GET /{locale}/auth/verify?token=` is out of scope (portal UI, W3-01). The API `POST /api/auth/magic-link/verify {token}` marks the token used, signs the session (`jwtSign` + `getFieldsToSign`, `addSessionToUser` if `useSessions`), sets the cookie via `generatePayloadCookie` and returns `303` to a sanitized same-origin `next` (default `/{preferredLocale}/account`).
- [x] A used, expired or unknown token → `400` with `errors.MAGIC_LINK_INVALID`. Never reveals which case applied.
- [x] `getCurrentCustomer(headers)` returns the customer for a valid cookie and `null` for staff or anonymous requests. `requireCustomer` throws a redirect error.
- [x] `POST /api/auth/logout` clears the cookie.
- [x] Integration tests: request → read hash row → verify with the raw token → `payload.auth({headers: cookie})` returns `collection: 'customers'`; replay of the same token fails; an expired token fails; an open-redirect `next=https://evil.com` falls back to the default.
- [x] If the Payload helpers do not work as typed, implement the DISCOVERY §3 fallback (custom `AuthStrategy` validating our own signed cookie) **without changing** the CONTRACT §4 surface, and record this in SESSION.

## Files to create
`apps/web/src/modules/identity/{index.ts,server/magic-link.ts,server/session.ts,server/rate-limit.ts,server/ports.ts,strategies/magic-link.ts}`, `apps/web/src/app/api/auth/{magic-link/request,magic-link/verify,logout}/route.ts`, `apps/web/src/modules/identity/__tests__/*.test.ts`, migration for the rate-limit table, `messages/{fr,en}.json` keys under `identity.*` and `errors.MAGIC_LINK_*` only.

## DO NOT TOUCH
- Other modules' collections. `customers` field changes require a Contract Change Request.
- Portal pages (W3-01).

## Done when
All tests pass in CI, staff login works on staging, and the SESSION entry has been added.

## Communication
Caveman. English only.

## Notes (2026-10-17, backend-engineer)

**Spike result (fallback used, surface unchanged).** `jwtSign`, `getFieldsToSign`, `generatePayloadCookie`, `addSessionToUser` all work as typed. Two Payload behaviours forced the DISCOVERY §3 fallback shape:
1. Payload's built-in `local-jwt` strategy rejects any collection with `disableLocalStrategy`, so `customers` ships its own `AuthStrategy` (`strategies/magic-link.ts`). It verifies the Payload-format HS256 cookie (`payload-token`, same name as staff) with `node:crypto`, checks `authVersion`, `exp`, `collection === 'customers'`, then loads the customer. `jose` is not a direct dependency, so no new dep was added.
2. With `disableLocalStrategy` Payload omits the `sessions` field, so `useSessions: false` for `customers`. Consequence: no server-side session store. Logout clears the cookie; a copied cookie stays valid until expiry (`tokenExpiration` 7 days, HttpOnly, SameSite=Lax, Secure in prod). `addSessionToUser` is still called (no-op while sessions are off).

**Contract Change Request (informational, orchestrator to decide).**
- Additive: new internal collection `auth-rate-limits` (`scope: email|ip`, `keyHash` SHA-256, timestamps; no relations; admin-hidden; Local API only). Required by the "Postgres table" criterion. Migration `20261017_183746_0002_auth_rate_limits`. Not in CONTRACT §3.2 yet.
- Optional hardening: add `sessions`/`sessionVersion` to `customers` (or `disableLocalStrategy: { enableFields: true }`) to get revocable sessions and "log out everywhere". Needs a `customers` field change, so not done here.
- `Result<void>` has no rate-limit code: `requestMagicLink` returns `CONFLICT { reason: 'MAGIC_LINK_RATE_LIMITED' }` and `verifyMagicLink` returns `VALIDATION` with message `MAGIC_LINK_INVALID`; the routes map them to `429` and `400 { error.code: 'MAGIC_LINK_INVALID' }`.

**Behaviour.**
- Request: IP limit (20/h) then email limit (5/h). Insert-then-count in `auth-rate-limits`, keyed by SHA-256 of IP/email, so concurrent requests cannot slip past. Old rows pruned opportunistically (24 h). `429` body has `messageKey: errors.MAGIC_LINK_RATE_LIMITED` plus `Retry-After`.
- Same `200 {ok:true}` for known/new email and also when the Resend send fails (error logged, never leaked). Customer upsert is race-safe (retry find after unique violation).
- Verify redeems with one atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING` through the typed drizzle client (`@payloadcms/db-postgres/drizzle`). Five concurrent redemptions of one token: exactly one `303` (tested). Route is POST only (no GET handler).
- `next` is accepted only as a same-origin absolute path (`sanitizeNext`); stored sanitized at request time and re-sanitized at verify; default `/{preferredLocale}/account`.
- All three POST routes check `Origin` (cross-site browser requests get `403`); form-encoded and JSON bodies are accepted so the W3-01 page can post a plain form.
- Email: `sendMagicLinkEmail` port in `server/ports.ts`; default sender = plain FR/EN text+HTML through the Payload Resend adapter (copy in `messages/{fr,en}.json` `identity.email.*`). Tests swap the sender with `setMagicLinkEmailSender`; W2-04 can do the same. The link points at `/{locale}/auth/verify?token=…` (page is W3-01).
- Admin isolation: customer cookie resolves to `collection: 'customers'`, `permissions.canAccessAdmin` is false (customers `access.admin: () => false`); staff cookie gives `canAccessAdmin: true` and `getCurrentCustomer` returns `null` for it.
- `getCurrentCustomer`/`requireCustomer`/`upsertCustomerByEmail`/`requestMagicLink`/`verifyMagicLink` exported from `@/modules/identity` per CONTRACT §4. `requireCustomer` uses Next `redirect()` to `/{locale}/auth/login` (locale from `x-next-intl-locale`, default `fr`).
- `server/payload.ts` lazy-imports `@/lib/payload` to avoid a config ↔ module import cycle.

**Tests.** 46 new tests: 21 integration in `__tests__/magic-link.test.ts` (real Postgres, skipped without `TEST_DATABASE_URL`), 25 unit (`next-path`, `strategy`, `ports`; run in CI). Whole suite on a throwaway Neon branch: 92/92. CI (no DB): 42 pass, 50 integration skipped, same as W1-02.

**Where the migration ran.** Throwaway branch `w1-03-verify` (deleted), Neon `dev`, Neon `staging`. Never `production`.

**Env.** `RESEND_API_KEY`/`EMAIL_FROM` already in env schema. `NEXT_PUBLIC_SITE_URL` builds the link. No new variables.
