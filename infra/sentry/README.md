# Sentry — setup and alert rules (W4-04)

Code is merged and inert until a DSN is set. **No DSN = strict no-op**: `Sentry.init` is never
called (server, edge, client), no network calls to Sentry, build and CI unaffected.

## What the code does

| Concern | Behaviour |
|---|---|
| Init | `apps/web/sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`; shared options in `src/lib/observability/init.ts` |
| PII | `sendDefaultPii: false`; `beforeSend` / `beforeSendTransaction` / `beforeBreadcrumb` run `src/lib/observability/scrub.ts` |
| Scrubbed | cookies, `authorization`, `stripe-signature`, `mux-signature`, `x-vercel-protection-bypass`, IPs, request bodies, emails, names, card-like digit runs, Stripe `metadata`/`customer_details`, query params `token next code session_id` + signed-URL params (Mux, R2/S3 `X-Amz-*`) |
| Stripe errors | Reduced to `type/code/param/requestId` via commerce `safeErrorFields` (W4-03b); never the message |
| Tracing | 0.1 in `production`, 0 elsewhere. **Session Replay is never enabled** |
| Tunnel | `/monitoring` (same-origin; CSP `connect-src 'self'` suffices; excluded from the locale proxy matcher) |
| Source maps | Uploaded only when `SENTRY_AUTH_TOKEN` is set (prod build); SDK deletes them after upload, never publicly served |
| Release | `VERCEL_GIT_COMMIT_SHA`; environment = `SENTRY_ENVIRONMENT` or `VERCEL_ENV` |

Event tags used by the alert rules: `alert=webhook:stripe`, `alert=webhook:mux`,
`alert=cron:<route>` (`expire-holds`, `reminders`, `jobs`), `alert=job:send-email`.
Hooks: `captureWebhookError` (stripe + video webhook 5xx paths), `captureCronFailure`
(cron routes), `captureJobFailure` (`send-email` task `onFail`, only when retries are exhausted).

## Erick setup (once)

1. Create a Sentry org + project `cook-for-friends` (platform: Next.js).
   **Data residency (Law 25):** pick the **EU (de)** region, or US only if you accept
   cross-border transfer; the choice is permanent for the org. Scrubbing above means no
   personal data is sent either way. Record the region in the privacy policy sub-processor list.
2. Vercel env (Production + Preview/staging unless noted):
   - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` — same DSN (DSN is not a secret).
   - `SENTRY_ENVIRONMENT` — `production` / `staging` (optional; falls back to `VERCEL_ENV`).
   - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — **Production build only**. Token scope: `project:releases` + `org:read`. Never `NEXT_PUBLIC_`. Rotate yearly or on leak.
3. Project Settings → Security & Privacy: enable **Data Scrubber**, **Use Default Scrubbers**,
   **Prevent Storing of IP Addresses** (defence in depth on top of the in-app scrubber).
4. Create the alert rules below. Notify: email to Erick (Issue Owners / specific member).

## Alert rules (spec)

| # | Name | Condition | Action |
|---|---|---|---|
| a | Webhook failure | Issue event where tag `alert` is `webhook:stripe` or `webhook:mux`, environment `production`; every event | Email immediately |
| b | Cron failure | Tag `alert` starts with `cron:`, `production`; every event | Email |
| c | Email job exhausted | Tag `alert` equals `job:send-email`, `production`; every event | Email |
| d | New production issue | "A new issue is created", environment `production` | Daily digest email (Issue Alerts → digest, or Weekly/Daily Reports) |
| e | Cron monitors (optional, future) | Sentry Cron Monitors for `/api/cron/expire-holds` (5 min), `/api/cron/jobs` (5 min), `/api/cron/reminders` (hourly) | Not wired: the Cloudflare cron worker drives these routes, so check-ins need either worker changes or a route-side `captureCheckIn`. Deferred. |

Fingerprints are fixed per source/route (`webhook:<source>:<eventType>`, `cron:<route>`,
`job:send-email`), so a burst of failures groups into one issue; use "every event" frequency
in a/b/c with a 1-per-hour action interval to avoid mailbox floods.

## Verifying after setup

1. Preview deploy with DSN set: trigger an error (e.g. `GET /api/cron/jobs` with a bad DB URL on a throwaway preview, or a bogus Stripe webhook signature does **not** alert — only 5xx do).
2. Check the event in Sentry: no cookie/authorization header, no email, no request body.
3. Confirm `https://<host>/monitoring` returns 200/204 to a POST from the browser SDK (no CSP error in console).
4. Confirm `.next/static/**/*.map` are absent from the deployed site.
