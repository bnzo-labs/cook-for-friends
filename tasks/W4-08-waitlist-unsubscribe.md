---
type: task
id: W4-08
status: complete
wave: 4
module: scheduling · notifications
agent: backend-engineer
model: sonnet
depends-on: [W4-03b]
migration-owner: false
---

# W4-08 — Waitlist "remove me" link (W3-10 L-10 follow-up)

## Mission
Every waitlist email carries a one-click-confirm "Remove me from the waitlist" link. Signed single-purpose token, GET confirm page without state change (scanner-safe), POST deletes the entry. Idempotent, no info leak.

## Context
CLAUDE.md, docs/CONTRACT.md §3.5/§4/§5.1, tasks/W4-03b-security-carryovers.md (L-10). Only waitlist email that exists: `waitlist-seat-available` (no "joined" confirmation email exists; none added).

## Ownership
`src/modules/scheduling/server/{unsubscribe-token,unsubscribe,http}.ts`, `src/app/api/waitlist/remove/route.ts`, `src/app/(frontend)/[locale]/waitlist/remove/page.tsx`, `src/components/storefront/waitlist/WaitlistRemoveForm.tsx`, `src/i18n/routing.ts` (one pathname), notifications `waitlist-seat-available` (types, validate, template), i18n `waitlistSeatAvailable` + `waitlist.remove` keys, CONTRACT change log (additive).

## Design
- Token `<entryId>.<expUnixSec>.<HMAC-SHA256 b64url>` over `waitlist-remove|id|exp` keyed by PAYLOAD_SECRET. No PII. TTL 90 days. timingSafeEqual.
- Link built in `claimAndNotify`; `removeUrl` optional in email data (in-flight queued jobs stay valid).
- `GET /{fr:/liste-attente/retrait, en:/waitlist/remove}?token=` page: noindex, no-referrer, no DB call, no state change.
- `POST /api/waitlist/remove {token}`: Origin check, 10/IP/h via `consumeRateLimit`, verify, delete entry (any status). Missing entry = still `{ ok: true }`. Bad/expired token = 400 `INVALID_TOKEN` (generic).
- No migration.

## Acceptance criteria
- [x] Token unit tests: sign/verify, tamper, wrong secret, expiry, malformed
- [x] Integration: POST removes, second POST idempotent, bad token 400
- [x] Template renders link FR/EN; absent when no url
- [x] FR/EN key parity; assertLocale on page
- [x] CI green; PR opened, not merged

## DO NOT TOUCH
`.github/**`, `package.json`, `next.config.ts`, `proxy.ts`, `src/lib/env.ts`, W4-02 files (perf/fonts/ci.yml Lighthouse).

## Operating rules
Standard W4 conventions (see W4-07 footer): worktree, Node 22, no local full tsc/vitest/build, no migration, never staging, never force push, never merge, no SESSION.md edits.

## Completion notes

W4-08 done. Commits: 7923226 token, 3133579 route+page+integration test, 87df8b1 email link, plus contract log. Email field is `removeUrl` (optional url, validated), built in `claimAndNotify` via `waitlistRemoveUrl` + `signWaitlistRemoveToken`; absent for queued jobs without it. ICU `waitlistSeatAvailable.removeLink` FR/EN present. Only `waitlist-seat-available` exists (no join email). No migration. SESSION.md untouched per rules. DRIFT: none.
