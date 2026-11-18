---
type: task
id: W4-03c
status: pending
wave: 4
batch: 4d
module: quality (review)
agent: security-reviewer
model: opus
depends-on: [W4-01, W4-02, W4-03a, W4-03b, W4-04]
migration-owner: false
---

# W4-03c — Final pre-launch security review (auth, webhook, video, access control, headers, observability PII)

## Mission
Independent go/no-go security review of `main` as it will ship to production. Output: findings table + PoC tests + fix briefs. **Zero open CRITICAL/HIGH is a precondition for W4-06.** Findings only — no fixes in this task.

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (Wave 4 plan entry) · 3. this file
4. `docs/MASTER_BUILD_SPEC.md` §4, §7, §8 · `docs/CONTRACT.md` §3.7, §4, §5.1, §6
5. `tasks/W2-11-*.md`, `tasks/W3-10-*.md`, `tasks/W4-03b-*.md` (what was fixed / moved), `tasks/W4-03a-*.md`, `tasks/W4-04-*.md`
6. `docs/RUNBOOK_PROD.md` draft if present (env list to cross-check)

## Ownership
This file, `apps/web/test/security/w4-*.test.ts` (PoC, `.fails`/skip-with-reason until fixed), `tasks/W4-1N-fix-<slug>.md` briefs.

## Dependencies
All of 4a–4c merged. Parallel with W4-06 drafting (W4-06 cannot be marked ready before this is `complete`).

## Checklist (each → PASS / finding with severity CRITICAL/HIGH/MEDIUM/LOW)
- **Auth:** magic link (token entropy, single use, TTL, POST verify, `next` open redirect, rate limits 5/email/h + 20/IP/h), logout revocation, staff password + Payload admin access, `sessionVersion`, cookie flags (`HttpOnly`, `Secure`, `SameSite=Lax`), CSRF Origin check on every state-changing route (enumerate `src/app/api/**` POST/PUT/PATCH/DELETE).
- **Webhooks:** Stripe signature on raw body, idempotency (replay, concurrent duplicate), foreign events skipped, zero-amount path, refund paths; Mux webhook signature + tolerance; both behave with Sentry capture (no payload/PII in events).
- **Video:** playback only with entitlement (or preview rule), TTL, no-store, fake provider impossible in prod (env guard + build check), signing keys server-only.
- **Access control:** CONTRACT §3.7 matrix against REST + GraphQL (`/api/graphql` enabled? introspection?), `readVersions`, field-level access (L-3), customer vs guest vs staff on orders/enrollments/certificates/materials/comments.
- **Headers:** W4-03a set present and correct in prod mode; CSP residual risk acceptable; HSTS scope vs D8.
- **Observability:** Sentry `beforeSend` scrubs emails, names, cookies, auth headers, tokens in URLs/query, Stripe metadata; `sendDefaultPii: false`; no replay of portal; source maps not publicly served.
- **Secrets:** `grep` the CI build `.next/static` artifact (download from CI, no local build) for `sk_`, `rk_`, `whsec_`, Mux/R2/Resend/Sentry auth tokens, `PAYLOAD_SECRET`; `.env.example` has no real values; gitleaks green.
- **Rate limits (§8):** auth + checkout + waitlist + comments + progress + playback present and keyed safely (L-6).
- **Privacy (Law 25, §8):** privacy policy page reachable FR/EN (content is the client's — missing content = handoff, not a code finding); no non-essential cookies (else consent banner required); PII retention for holds (7 d), waitlist, logs.
- **Prod config review:** cross-check `docs/RUNBOOK_PROD.md` env list vs `src/lib/env.ts` (no `VIDEO_FAKE_ALLOWED`, `CSP_MODE=enforce`, test keys rejected in prod?).

## Done When
- [ ] Findings table in this file (id, severity, location, evidence, fix owner per CONTRACT §1).
- [ ] PoC tests for CRITICAL/HIGH under `apps/web/test/security/w4-*.test.ts`.
- [ ] Every CRITICAL/HIGH → `tasks/W4-1N-fix-<slug>.md` (same frontmatter/sections + standing rules, owner per CONTRACT §1, `depends-on: [W4-03c]`); this task `blocked` ("fixes required") until they merge, then `complete`.
- [ ] MEDIUM/LOW → listed as post-launch backlog with an explicit "accept for launch: yes/no" recommendation for Erick.
- [ ] Explicit **GO / NO-GO** line for W4-06 at the top of Completion notes.

## Erick handoffs
- None (privacy policy text is tracked in W4-06's checklist).

## DO NOT TOUCH
`apps/web/src/**`, migrations, `docs/**` (except reading), `.github/**`.

## Operating rules (Wave 4 — standing, from Wave 1–3 lessons)
- **Worktree:** `git -C /Users/erick/work/CookForFriends fetch origin && git -C /Users/erick/work/CookForFriends worktree add ../cff-<id> -b <id> origin/main` (`<id>` = lower-case task id, e.g. `w4-01`); then `cp -p /Users/erick/work/CookForFriends/apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit original `.env*`. Never `vercel env pull` / `vercel link` in the repo. Never commit `apps/web/AGENTS.md` / `apps/web/CLAUDE.md`.
- **Node 22 via nvm** (`nvm use 22`) before any `pnpm` command. `VIDEO_PROVIDER=fake` + `VIDEO_FAKE_ALLOWED=true` locally and in tests. Never in production.
- **Machine load rule: NO full local `next build`, NO `next start`/`next dev` app boot, NO parallel `tsc` runs.** Allowed locally: targeted `vitest run <file>`, single `pnpm -C apps/web typecheck` (one at a time), `pnpm -C apps/web lint`. **CI is the evidence** — push to your PR branch and read the CI run (`gh run watch`, `gh run view --log-failed`). Playwright and Lighthouse run only in the CI `e2e` job.
- **Never set `PAYLOAD_DB_PUSH=1`** and never boot Payload in dev mode against shared Neon `dev`/`staging` (schema push corrupted enums once, PR #12).
- **Neon:** `neonctl branches create` may be denied — do **not** work around it (no other credentials, no other tools). Integration tests run in CI on the per-run branch; make sure your tests actually run there (not skipped). **Never Neon `production` (`main` branch).** **Never write to staging** (DB, Stripe staging webhook, Vercel env) without an explicit Erick OK recorded in this file.
- **Migrations:** only the migration owner named in the plan (Wave 4: W4-03b, only if a finding needs it) runs `migrate:create` and regenerates `src/payload-types.ts`; up/down/up proven in CI. Orchestrator applies after merge. Anyone else needing schema → `## Contract Change Request` here, `status: blocked`, exit.
- **Payload unique conflicts:** detect by the error's column/field **path** (e.g. `error.data.errors[].path`), never by matching message text (localized / driver-specific).
- **i18n:** every next-intl `t()` with ICU placeholders gets its values. FR + EN key parity (i18n test): add both or neither, only under your namespace(s); on rebase conflict keep both sides.
- **`[locale]` routes:** `assertLocale(params.locale)` before any DB/module call.
- **Dates:** `Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto' })`; no CSS `capitalize`/`uppercase` on FR dates.
- **Contrast:** text ≥ 4.5:1; secondary text `text-fg-muted`, never `text-fg-subtle`; no hard-coded colors (DESIGN_SPEC §7).
- **E2E:** Playwright with system Chrome in CI (`PW_CHANNEL=chrome`); deterministic waits (poll DB/HTTP), no fixed sleeps; assertions scoped to your own fixtures (no global counts — the CI branch is shared by all specs in the run).
- **Secrets:** never print, log or commit keys/secrets/bypass tokens; `::add-mask::` anything derived in CI.
- **Git:** small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Never force push** (need main? merge `origin/main` into your branch). Push, **open a PR** (`gh pr create`, title `<type>(<ID>): …`), **never merge** — the orchestrator merges. PR body: summary, criteria checklist, CI run link(s), deviations, Erick handoffs; last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not edit `docs/SESSION.md`** or `docs/MASTER_BUILD_SPEC.md`. Notes go in the PR body and `## Completion notes` at the bottom of this file. Tick criteria here; set `status: complete` (or `blocked` + reason).
- **Fully autonomous.** Never wait for Erick: every handoff has a workaround; use it and record it. Real blocker → `status: blocked` + reason here + PR note, exit. Out-of-scope drift (MASTER §5) → stop, write `DRIFT:` here.

## Communication
Caveman. English only.

## Review log (W4-03c — in progress)
Reviewed tree: `origin/main` @ 13a20bc. Doc lives here (brief: `docs/**` read-only). Sections filled area by area.

### A. Session-cancel job + staff cancel-seat (authz, refund cap, double refund, idempotency)
Paths relative to `apps/web/src/`.

| Item | Verdict | Evidence |
|------|---------|----------|
| POST cancel authn/authz | PASS | `modules/scheduling/server/http.ts:45-66`: Origin first, anon 401, staff = `users` + `isStaff`, customer must have a relation to the seat (`getEnrollmentView(id, customer)`) else 404 (no oracle), guest buyer path → NOT_BUYER (W3-10) |
| `mode: full` staff only | PASS | `http.ts:64` 403 for customers; zod enum on body (`:36`) |
| GET preview staff only | PASS | `http.ts:74-80` 401/403 before id parse; read-only |
| Rate limit | PASS | 20/h per actor (`http.ts:24,52`) on POST. GET preview unlimited but staff-only |
| Refund cap | PASS | `commerce/seats/cancel.ts:126-131` cap = min(seat − linked refunds, order total − all refunds incl. Dashboard − sibling promises) (`seats/cap.ts:42-47`), evaluated inside tx with `FOR UPDATE` on enrollment AND order (`:117-122`); `amount` zod int 0..10M |
| Double refund (concurrent / retry) | PASS | Per-seat `pg_advisory_xact_lock` held across plan + Stripe call (`cancel.ts:193-198`); Stripe idempotency key `seat-cancel-<id>`; retry replays PERSISTED amount (L-2) and checks `refunds.list` metadata first (`:154-166`); retry re-checked vs cap (`:142`) |
| Session-cancel job trigger | PASS | `catalog/collections/sessions.ts:59-69` queues only on update by a `users` record; `sessions.update` = `isStaffOrAdmin`. Payload jobs `run` endpoint staff only (`lib/jobs-access.ts`) |
| Session-cancel job idempotent / resumable | PASS | `scheduling/server/session-cancel.ts`: sequential, re-reads session status per seat (flip back stops run), non-confirmed seats skipped, pending refunds retried with persisted amount, emails keyed `session-cancel-<id>-*`, throws only on transient → Payload retry (8, exp) |
| Session-cancel amount | PASS | `fullRefundDecision` → commerce re-clamps under lock; job cannot exceed cap |
| Duplicate jobs | **FINDING** LOW A-1 | Hook fires on EVERY update while `status=cancelled` (no `previousDoc.status` transition check, `sessions.ts:60`). Each save of an already-cancelled session queues another full run. Safe (seat guard + skip + idempotency key) but extra Stripe `refunds.list` calls and log noise |
| Concurrent duplicate runs | PASS | Two runs on one seat serialize on the advisory lock; second sees cancelled → skip or REFUND_ALREADY_REQUESTED → skip (no 2nd email) |
| PII in logs | PASS | ids/codes/counts only (`session-cancel.ts:35-39`, `seatLog`) |

Note → area G: customers are Payload auth users (`customers.auth`), so any collection relying on Payload default access (`Boolean(req.user)`) is open to customers. `payload-jobs` collection REST (not just `run`) checked in G.

Area A result: 0 CRIT · 0 HIGH · 0 MED · 1 LOW.

### B. Waitlist remove token + route (HMAC, expiry, scanner-safe GET, rate limit, enumeration) — W4-08

| Item | Verdict | Evidence |
|------|---------|----------|
| Token construction | PASS | `modules/scheduling/server/unsubscribe-token.ts:14-21`: HMAC-SHA256 over `waitlist-remove|<id>|<exp>` (purpose-bound, no PII), base64url; id regex + exp regex before MAC |
| Verify | PASS | `:24-37` length cap 200, exactly 3 parts, `timingSafeEqual` after length check, expiry checked after MAC; every failure → `null` (no reason) |
| Expiry | PASS | 90 d TTL; entries purged 30 d after session end anyway (W4-03b L-10) |
| Forgery / IDOR | PASS | Entry id is sequential but MAC-bound; no way to delete another entry without its token |
| Scanner-safe GET | PASS | `app/(frontend)/[locale]/waitlist/remove/page.tsx`: GET renders a confirm button only, no DB call; mutation via POST `/api/waitlist/remove` |
| Token leakage | PASS | Page `robots: noindex`, `referrer: no-referrer` (`page.tsx:11-14`). Query-string token in access logs / Sentry URL → area D |
| POST route | PASS | `server/http.ts:131-149`: Origin check, 10/IP/h (IP via `x-vercel-forwarded-for`, L-6), zod 1..200, generic 400 `INVALID_TOKEN`, `{ ok: true }` even if entry already gone (idempotent, no existence oracle) |
| Join enumeration | PASS | Duplicate join silent success; 5/IP/h + 3/email/h (`http.ts:96-118`) |
| Key management | PASS (note) | Key = `PAYLOAD_SECRET` (domain-separated by purpose prefix; Payload JWT derives its own key). Rotating `PAYLOAD_SECRET` invalidates outstanding remove links + staff sessions — acceptable, runbook note |
| Delete semantics | PASS | Hard delete with `overrideAccess` only after valid MAC (`unsubscribe.ts:10-16`); good for Law 25 minimisation |

Area B result: 0 findings.

### C. Dollars→cents conversion (rounding, negative, >2 dp) — money fields, discount codes

| Item | Verdict | Evidence |
|------|---------|----------|
| Float drift | PASS | `modules/catalog/fields/money.ts:54-59` `Math.round(v*100)` then rejects if residue > 1e-6: `19.99`→1999, `45.5`→4550, `1.005`→NaN (3 dp), `0.001`→NaN |
| Negative / NaN / Infinity | PASS | `dollarsToCents` → NaN; mirror copies the raw value into cents so `validateCents` (integer ≥ 0) rejects the save (`:96`, `:4-11`) |
| > 2 decimals | PASS | rejected (NaN → non-integer cents → validation error); never silently rounded |
| Upper bound | **FINDING** LOW C-1 | `validateDollars` max $100,000 (`:75`) is dead code: the collection `beforeValidate` mirror (`courses.ts:36-38`, `discount-codes.ts:43-46`) deletes the virtual dollars key before field validation, so the dollars validator sees `undefined`; cents validator has no max. Staff typo `1000000` → price 100,000,000 cents → Stripe price sync/checkout fails (Stripe max 99,999,999), or Postgres int overflow error above 2^31. Staff-only, fails closed (no wrong charge) |
| API write of cents | PASS | Mirror only overrides when dollars differ from stored cents (`:87-99`), API/seed cents writes untouched |
| Discount percent | PASS | `validateDiscountValue` integer 1..100 for `percent` (`commerce/collections/discount-codes.ts:13-20`); `percentValue` max 100 |
| Discount amount | PASS | same `applyDollarMirror` path → integer cents ≥ 0; amount > price handled by Stripe (amount_off clamps to 0 → zero-amount path, W4-01) |
| Who writes money | PASS | `courses`/`discount-codes` create/update staff only; checkout reads cents server-side (never client-supplied amounts, W2-11) |
| Kind switch | PASS (note) | Switching `percent`→`amount` without retyping keeps `value` (e.g. 20 → $0.20 off). Wrong discount is staff-visible in the admin list column; UX, not security |

Area C result: 0 CRIT · 0 HIGH · 0 MED · 1 LOW.

### D. Sentry scrubber + capture (PII) — lib/observability

| Item | Verdict | Evidence |
|------|---------|----------|
| Init options | PASS | `lib/observability/init.ts:29-44`: `sendDefaultPii: false`, no `replayIntegration`, `beforeSend`/`beforeSendTransaction`/`beforeBreadcrumb` = scrubber; strict no-op without DSN (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`) |
| Request scrubbing | PASS | `scrub.ts:98-106` drops cookies, body, `query_string`; headers drop cookie/auth/stripe-signature/mux-signature/bypass/IP (`:11-20`); `request.url` query `token,next,code,session_id,email,key` + signed-URL keys stripped (`:22-25,40-61`) |
| User | PASS | `user` reduced to `{ id }` (`:125`) |
| Free text | PASS (note) | messages/exception values: emails + 13–19 digit runs redacted (`:35-37`). Names inside free-text error messages are not detected (structured `name`/`first_name`… keys are) |
| Stripe metadata / customer_details | PASS | `DROP_KEYS` (`:31`) |
| Capture helpers | PASS | `capture.ts`: rebuilt `Error` from `safeErrorFields` (no Stripe params echo), tags = source/event id/type/idempotency key only |
| Span / trace URL attributes | **FINDING** MEDIUM D-1 | `scrubValue` runs `scrubUrl` only for keys exactly `url`/`href`/`referer(r)` (`:69`). Span data + `contexts.trace.data` keys `http.url`, `http.target`, `url.full`, `url.query`, `http.query` get only `scrubString` → `?token=` survives. Exposure: GET `/<locale>/auth/verify?token=…` (magic link, 15-min TTL, single use; consumed by POST seconds later) and `/waitlist/remove?token=…` (90 d). `tracesSampleRate` 0.1 in prod. Impact: anyone with Sentry project access could replay an unconsumed magic link → account takeover window ≤ 15 min. PoC `apps/web/test/security/w4-sentry-span-url.test.ts` (`it.fails`, pure, runs in verify job). Runtime presence of the query in those attributes not observed (no DSN in CI) — scrubber gap proven, SDK emission inferred from OTel semconv |
| Certificate code in path | LOW D-2 | `/<locale>/certificates/verify/<code>` path (transaction name, request.url) not scrubbed → Sentry sees code → name + course. Code is meant to be shareable (public verify page), so low |
| Source maps | see area E | `next.config.ts:53` `sourcemaps.disable: "disable-upload"` when no auth token — public `.map` check in E |
| Tunnel | PASS | `/monitoring` same-origin, excluded from proxy (CSP `connect-src 'self'`) |

Sentry inactive at launch (no DSN) → D-1 has no exposure until a DSN is set. **Fix before setting `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`**: scrub any key matching `/(^|\.)(url|target|query|full)$/i` (and `http.fragment`) with `scrubUrl`, or drop query from all span data.

Area D result: 0 CRIT · 0 HIGH · 1 MED · 1 LOW.

### E. CSP/headers (W4-03a) + test-only code unreachable in prod

| Item | Verdict | Evidence |
|------|---------|----------|
| Header set | PASS | `lib/security-headers.ts:93-111` via `next.config.ts headers()` on `/:path*` (pages, API, admin, static): CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment off), COOP same-origin |
| CSP directives | PASS | `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`; `frame-src 'none'`; `form-action 'self' https://checkout.stripe.com`; img/media/connect limited to self + Mux (+ R2 origin) + Gravatar (admin); no wildcard hosts except `*.mux.com`/`*.litix.io`; `upgrade-insecure-requests` on https prod |
| CSP mode | PASS (note) | `CSP_MODE` default `enforce`; only literal `report-only` downgrades (`:53-55`). Runbook must not set it in prod (checked in G) |
| `script-src 'unsafe-inline'` | ACCEPTED residual (LOW E-1) | No nonce (would make every page dynamic, kills ISR). CSP gives no XSS script-injection defence; remaining defences: React escaping, no `dangerouslySetInnerHTML` except escaped JSON-LD (W3-10), Lexical renderer, comments plain text, `object-src`/`base-uri`/`form-action`/`frame-ancestors` still cut exfil/clickjack paths. Accept for launch: yes. Post-launch: hash-based or nonce on dynamic routes only (`/account/**`, admin) |
| HSTS | PASS (note) | `max-age=31536000` only on https, no `includeSubDomains`/`preload` until D8 (domain shared with Shopify) — correct scope |
| CSP report | PASS | `report-uri` only when a DSN is set; key in report URI is the public DSN key |
| Sentry tunnel `/monitoring` | LOW E-2 | Public ingest relay (standard `@sentry/nextjs` tunnel, fixed org/project): anyone can POST junk events → Sentry quota burn. No data exposure. Accept: yes |
| Fake Stripe (`test/e2e-stripe/*`) | PASS | Not imported by `src/**` (grep). Loaded only by CI `next start` via `NODE_OPTIONS=--require test/e2e-stripe/stripe-redirect.cjs` (`ci.yml:426-431`) in `signed-events` mode. Prod reachability requires a Vercel `NODE_OPTIONS` env pointing at it → runbook check (G) |
| Fake video provider | PASS | `video/server/config.ts:17-25` refuses fake when `VERCEL_ENV=production` even with opt-in (W4-03b L-5) |
| Test seams in `src` | PASS (note) | `setStripeForTests`, `setMuxPortForTests`, `setSeatFaultForTests`, `setWebhookFaultForTests` throw outside test env. `setEmailTransportForTests` (`notifications/server/transport.ts:77`) is unguarded but has no caller outside tests and no route reaches it |
| Public bundle secrets + source maps | see below | New CI check `apps/web/e2e/w4-03c-bundle-secrets.test.ts` scans the CI `next build` `.next/static` for `sk_/rk_/whsec_`, DB URLs and the literal values of 15 secret env vars, and probes `GET <chunk>.map` ≠ 200. Brief asked to download a CI build artifact; CI uploads none and `.github/**` is DO-NOT-TOUCH, so the scan runs inside the e2e job instead (deviation). Result: _pending CI_ |

Area E result: 0 CRIT · 0 HIGH · 0 MED · 2 LOW (pending bundle scan).

### F. CI secrets handling (ci.yml) + Law 25 privacy

**CI secrets**

| Item | Verdict | Evidence |
|------|---------|----------|
| Fork / untrusted PRs | PASS | `on: pull_request` + `push: main` only; no `pull_request_target`, no `workflow_run` (`ci.yml:3-7`, comment `:89`) |
| GITHUB_TOKEN scope | PASS (note) | No `permissions:` block in `ci.yml` / `lighthouse-staging.yml`, but repo default workflow permissions = `read` (GitHub API). Add explicit `permissions: contents: read` for defence in depth (LOW F-1) |
| Ephemeral secrets | PASS | `PAYLOAD_SECRET`, `CRON_SECRET`, `SEED_PASSWORD` generated per run with `openssl rand`, `::add-mask::` before `$GITHUB_ENV` (`ci.yml:336-353`); Neon branch URL masked (`:172`, `:337`); per-run Neon branch with expiry + delete |
| Live Stripe keys | PASS | Gate rejects anything not `sk_test_`/`rk_test_` (`ci.yml:278-296`); key + derived `whsec` masked (`:369-371`, `:408`) |
| Action pinning | LOW F-2 | Neon actions SHA-pinned; `actions/*` and third-party `pnpm/action-setup@v4` tag-pinned. Pin `pnpm/action-setup` to SHA |
| Artifacts | LOW F-3 | `lighthouse-staging.yml` writes the Vercel bypass secret into LHCI `extraHeaders`; Lighthouse JSON reports echo `configSettings.extraHeaders` → uploaded artifact `lighthouse-staging-reports` (7 d) contains `VERCEL_AUTOMATION_BYPASS_SECRET` in clear (`::add-mask::` only masks logs). `stripe-listen.log` artifact (live-test mode) contains the CLI-session `whsec_` (test mode). Repo private, collaborators only → staging protection bypass for anyone with repo read. Fix: delete `configSettings` from LHR before upload or upload only HTML w/ header stripped; rotate bypass after |
| gitleaks | PASS | `secret-scan` job gates all others; green on this PR |
| `.env.example` | PASS (G) | checked in G |

**Law 25 / privacy**

| Item | Verdict | Evidence |
|------|---------|----------|
| Non-essential cookies | **FINDING** MEDIUM F-4 | `components/portal/player/MuxStage.tsx:24-36` renders `<MuxPlayer>` without `disableCookies`/`disableTracking`; Mux Data is on by default (CSP allows `*.litix.io`, `security-headers.ts:75`) and sets a persistent first-party `muxData` cookie (random `mux_viewer_id`, multi-year) + sends viewing analytics to Mux. That is a tracking technology, not strictly necessary → Law 25 s.8.1 requires it off by default / consent; site has no consent banner. Fix (1 prop): `disableCookies` (keeps QoS beacons, no cookie) — or `disableTracking` if Erick prefers no Mux Data at all. Fix brief `tasks/W4-10-fix-mux-data-cookie.md` |
| Other cookies | PASS | Only `set-cookie` writers: cart (`app/api/checkout/route.ts:29`), session (magic-link verify), logout clear, Payload admin auth, `NEXT_LOCALE` (next-intl preference) — all strictly necessary |
| Privacy policy reachable | LOW F-5 | No privacy route and no footer/nav link (`components/layout/nav-items.ts`, `SiteFooter.tsx`; no `privacy`/`confidentialit` string in `src`). Can be a CMS `pages` doc via `[...slug]`, but nothing links it. Content = client handoff (W4-06 checklist); add footer link when the page exists |
| Hold PII retention 7 d | PASS | `commerce/server/expire.ts:9,27-31` deletes `seat_holds_attendees` of non-active holds 7 d after expiry |
| Waitlist retention | PASS | purge 30 d after session end (W4-03b L-10); one-click removal (B) |
| Logs | PASS (note) | Structured logs carry ids/codes only (W4-03b L-5, `seatLog`, session-cancel `log`); retention = Vercel plan default, no log drain configured |
| Sentry | see D-1 | PII scrubbed except token gap; inactive at launch |

Area F result: 0 CRIT · 0 HIGH · 1 MED · 4 LOW.

### G. Auth / webhooks / access control / rate limits / prod config (brief checklist)
Magic link, webhooks, video, comments, certificates, cancellation were PASS in W2-11/W3-10 and their findings fixed in W4-03b (re-verified by reading the W4-03b diff targets listed there). Delta review on `main` @ 13a20bc:

| Item | Verdict | Evidence |
|------|---------|----------|
| Magic link | PASS (re-check) | 15-min TTL (`identity/server/magic-link.ts:17`), POST verify, 5/email/h + 20/IP/h (`:105-106`), `sanitizeNext` idempotent (W4-03b L-1) |
| Customer cookie | PASS | `customers.auth.cookies`: `SameSite=Lax`, `Secure` in prod, HttpOnly (Payload), 7 d, `sessionVersion` revocation (`identity/collections/customers.ts:14-23`) |
| Staff cookie `Secure` | **FINDING** LOW G-1 | `users` collection `auth: true` (`identity/collections/users.ts:11`) → Payload default `cookies.secure: false` (`payload/dist/collections/config/defaults.js:135`). Staff `payload-token` is sent over plain http on a first http request before HSTS is cached (no preload/includeSubDomains, D8). Fix: `auth: { cookies: { sameSite: "Lax", secure: NODE_ENV === "production" } }` |
| Payload REST CSRF allowlist | **FINDING** LOW G-2 | No `csrf` / `serverURL` in `payload.config.ts` → `config.csrf = []` → Payload `extractJWT` accepts cookie auth from ANY Origin (`payload/dist/auth/extractJWT.js:19-28`). Cross-site is still blocked by `SameSite=Lax`, but SameSite is per registrable domain: if D8 puts the app on a subdomain of the Shopify store's domain, Shopify theme/app scripts are same-site and can drive Payload REST with the customer/staff cookie. Custom routes have their own Origin check (all 14 mutating handlers checked). Fix: `csrf: [NEXT_PUBLIC_SITE_URL]` (platform, `payload.config.ts`) |
| Payload system collection `payload-locked-documents` | **FINDING** MEDIUM G-3 | Payload default access `Boolean(req.user)` (`payload/dist/locked-documents/config.js:43-48`); customers are Payload auth users (magic-link strategy, see `lib/jobs-access.ts` comment). A signed-in customer can `GET /api/payload-locked-documents` (which admin docs are being edited, staff user ids, timestamps) and `POST`/`DELETE` locks on any document → staff see "locked by another user" / lose locks (admin integrity/DoS, no business data: populated `document` still goes through each collection's read access). Same class as W2-11 L-1 (jobs `run`). `payload-jobs` (all access false), `payload-preferences` (own only), `payload-migrations` (`endpoints: false`) are fine. GraphQL disabled (`payload.config.ts:157`). Fix: shadow `app/api/payload-locked-documents/[[...rest]]/route.ts` → 404 unless staff, or `lockDocuments: false` where not needed. Accept for launch: yes (no data/money impact), fix in first patch |
| Staff login brute force | PASS (note) | Payload per-account lockout 5 attempts / 10 min; no per-IP limit on `/api/users/login` (few staff accounts; spraying bounded by lockout) |
| Webhooks | PASS (re-check) | Stripe raw-body signature + event-id ledger; Mux `unwrap` 300 s; Sentry capture sends ids/types only (D) |
| Video | PASS | entitlement-gated playback, TTL ≤ 2 h, `no-store`; fake refused on `VERCEL_ENV=production` |
| Access matrix | PASS (re-check) | `readVersions` staff on drafts collections (W4-03b L-8); field-level reads fixed (W4-03b L-3, L-7); GraphQL off |
| Rate limits §8 | PASS | auth (magic link), checkout (`app/api/checkout/route.ts:32`), waitlist join/remove, comments, progress, playback, materials, certificates, cancel — keys via `clientIp` (L-6) or customer id |
| Origin check | PASS | every `POST/PUT/PATCH/DELETE` under `app/api/**` either calls `isAllowedOrigin` or delegates to a module `handle*` that does; exceptions by design: Stripe/Mux webhooks (signature), cron (Bearer `CRON_SECRET`) |
| `.env.example` | PASS | every value empty or a non-secret default (`fake`, `enforce`, `http://localhost:3000`) |
| Prod config guards | LOW G-4 | `lib/env.ts` accepts `sk_test_` keys and `NEXT_PUBLIC_SKIP_ENV_VALIDATION` in production; `CSP_MODE=report-only` allowed in prod. Misconfig → test-mode "paid" orders grant real entitlements. `docs/RUNBOOK_PROD.md` does not exist yet → env cross-check deferred to W4-06: runbook must assert `STRIPE_SECRET_KEY` starts `sk_live_`/`rk_live_`, no `VIDEO_FAKE_ALLOWED`, no `NEXT_PUBLIC_SKIP_ENV_VALIDATION`, `CSP_MODE` unset/`enforce`, no `NODE_OPTIONS` (fake Stripe preload, E). Optional code guard: refuse `sk_test_` when `VERCEL_ENV=production` |

Area G result: 0 CRIT · 0 HIGH · 1 MED · 3 LOW.

### H. Accepted residuals re-evaluated

| Residual | Still acceptable? | Reasoning / condition |
|----------|-------------------|-----------------------|
| W3-10 H-1 remainder: image uploaded to `media` is public until attached to a material (+ ≤ 30 s cache on other instances) | **Yes** | `mediaReadAccess` (`catalog/server/material-media.ts:76-84`) fails closed; window only between upload and attach; guide tells staff to upload inside the material form. **Condition (W4-06):** R2 bucket must have NO public access (no `r2.dev`, no custom domain). `R2_PUBLIC_URL` is a required env (`lib/env.ts:52`) and in CSP `img-src`; if it points at a publicly readable bucket, every material file (PDF/image) is fetchable by key, bypassing all material access control → that would be HIGH. Not verifiable from code (no R2 creds) → explicit W4-06 runbook check (H-6) |
| Credit codes are bearer codes (W3-10 L-3) | **Yes** | 40-bit CSPRNG, single redemption, 365 d, Stripe-side brute force infeasible; loss = one seat value, buyer-controlled sharing. Policy/FAQ copy (W4-02) |
| Mux playback token not viewer-bound (W3-10 L-4) | **Yes** | Entitled viewer could share a URL valid ≤ 1 h; same as any signed-URL VOD. Condition: Mux referrer allow-list in W4-06 runbook |
| Sentry inactive at launch | **Yes, with conditions** | No DSN → no PII path, but also no alerting (OWASP A09): incidents seen only via Vercel logs / Stripe Dashboard / customer emails. Conditions: (1) fix D-1 before ever setting a DSN; (2) W4-06 runbook names who checks Vercel error logs + Stripe failed-webhook emails daily for the first 2 weeks |
| Live Stripe e2e unverified (CI = signed-events fake wire) | **Yes, with condition** | Code path (signature, idempotency, refunds) is exercised end-to-end against a wire-compatible fake; real Checkout redirect, live webhook delivery/secret, Stripe Tax and live refunds are not. Condition: W4-06 production smoke = one real purchase (lowest price or 100 % code → zero-amount path is separate, so use a real card), verify order `paid` + entitlement + email, then staff cancel → refund visible in Stripe and order `partially_refunded/refunded`; webhook endpoint shows 2xx |

Area H result: all 5 residuals still acceptable; 1 new LOW H-6 (R2 bucket public-access check, W4-06).

### Findings table
| ID | Sev | Location | Evidence | Fix owner | Status |
|----|-----|----------|----------|-----------|--------|

### Post-launch backlog (MEDIUM/LOW)
| ID | Sev | Summary | Accept for launch | Reason |
|----|-----|---------|-------------------|--------|
| A-1 | LOW | session-cancel queued on every save of a cancelled session (no transition check) | yes | idempotent; cost = extra Stripe list calls; fix: `previousDoc.status !== 'cancelled'` |
| C-1 | LOW | $100k max on dollars fields is dead code (mirror strips key before validation); cents unbounded | yes | staff-only, fails closed at Stripe/DB; fix: max in `validateCents` or in mirror |
| D-1 | MED | Sentry scrubber misses span/trace URL attrs (`http.url`, `http.target`, `url.full`, `url.query`, `http.query`) → magic-link/waitlist tokens to Sentry | yes **only while no Sentry DSN**; no if DSN set at launch | gate on DSN; PoC `test/security/w4-sentry-span-url.test.ts` |
| D-2 | LOW | certificate verify code in URL path reaches Sentry | yes | code is public by design |
| E-1 | LOW | CSP `script-src 'unsafe-inline'` (no nonce) | yes | ISR trade-off (W4-03a); no known injection sink; revisit nonce on dynamic routes |
| E-2 | LOW | `/monitoring` Sentry tunnel accepts arbitrary events | yes | quota abuse only |
| F-1 | LOW | no explicit `permissions:` in workflows | yes | repo default already `read` |
| F-2 | LOW | `pnpm/action-setup` tag-pinned | yes | supply-chain hygiene |
| F-3 | LOW | Vercel bypass secret in `lighthouse-staging-reports` artifact (LHR `configSettings.extraHeaders`) | yes | private repo; strip before upload, rotate bypass |
| F-4 | MED | Mux Data cookie `muxData` set without consent (Law 25 s.8.1) | **no** | one-prop fix, brief `tasks/W4-10-fix-mux-data-cookie.md` |
| F-5 | LOW | privacy policy page not linked / no route | yes (handoff) | content tracked in W4-06 |
| G-1 | LOW | staff `payload-token` cookie lacks `Secure` | yes | HTTPS + HSTS on prod; one-line fix |
| G-2 | LOW | Payload `csrf` allowlist empty → cookie auth from any origin | yes | SameSite=Lax covers cross-site; matters if D8 = Shopify sibling subdomain |
| G-3 | MED | customers can read/create/delete `payload-locked-documents` via REST | yes | admin UX integrity only, no data/money; fix first patch |
| G-4 | LOW | env accepts test Stripe key / skip-validation / CSP report-only in prod | yes | W4-06 runbook assertions |
| H-6 | LOW | R2 bucket public access unverified (`R2_PUBLIC_URL` required) | yes **iff** W4-06 confirms bucket private | public bucket would bypass material access (HIGH) |
