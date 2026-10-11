---
type: task
id: W1-03
status: pending
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
- [ ] Staff log in at `/admin` with email + password. A `customers` JWT/cookie gets 403 at `/admin`.
- [ ] `POST /api/auth/magic-link/request` returns `200 {ok:true}` for both existing and new emails (same body and similar timing). It upserts the customer and stores **only** a SHA-256 token hash with a 15-min expiry. The token is 32 random bytes, base64url.
- [ ] Rate limits: 5 requests per email per hour and 20 per IP per hour. Excess requests return `429` with a localized message key. The store is a Postgres table (not in-memory), since serverless instances do not share memory.
- [ ] `notifications` is not built yet. Call an internal `sendMagicLinkEmail` port defined in `identity/server/ports.ts`; W2-04 wires the real template. Until then the port sends a plain FR/EN Resend email (subject + link). **Not a mock:** it really sends.
- [ ] `GET /{locale}/auth/verify?token=` is out of scope (portal UI, W3-01). The API `POST /api/auth/magic-link/verify {token}` marks the token used, signs the session (`jwtSign` + `getFieldsToSign`, `addSessionToUser` if `useSessions`), sets the cookie via `generatePayloadCookie` and returns `303` to a sanitized same-origin `next` (default `/{preferredLocale}/account`).
- [ ] A used, expired or unknown token → `400` with `errors.MAGIC_LINK_INVALID`. Never reveals which case applied.
- [ ] `getCurrentCustomer(headers)` returns the customer for a valid cookie and `null` for staff or anonymous requests. `requireCustomer` throws a redirect error.
- [ ] `POST /api/auth/logout` clears the cookie.
- [ ] Integration tests: request → read hash row → verify with the raw token → `payload.auth({headers: cookie})` returns `collection: 'customers'`; replay of the same token fails; an expired token fails; an open-redirect `next=https://evil.com` falls back to the default.
- [ ] If the Payload helpers do not work as typed, implement the DISCOVERY §3 fallback (custom `AuthStrategy` validating our own signed cookie) **without changing** the CONTRACT §4 surface, and record this in SESSION.

## Files to create
`apps/web/src/modules/identity/{index.ts,server/magic-link.ts,server/session.ts,server/rate-limit.ts,server/ports.ts,strategies/magic-link.ts}`, `apps/web/src/app/api/auth/{magic-link/request,magic-link/verify,logout}/route.ts`, `apps/web/src/modules/identity/__tests__/*.test.ts`, migration for the rate-limit table, `messages/{fr,en}.json` keys under `identity.*` and `errors.MAGIC_LINK_*` only.

## DO NOT TOUCH
- Other modules' collections. `customers` field changes require a Contract Change Request.
- Portal pages (W3-01).

## Done when
All tests pass in CI, staff login works on staging, and the SESSION entry has been added.

## Communication
Caveman. English only.
