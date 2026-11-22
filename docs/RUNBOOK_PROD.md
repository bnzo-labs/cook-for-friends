# Production Runbook — Cook for Friends

> **APPROVAL GATE.** This document is written by the devops agent (W4-06). It is executed only
> by Erick after explicit sign-off. No agent runs any step in this file.

**Status:** `ready-for-approval` — awaiting Erick launch approval.

---

## Pre-flight checklist

Work through every checkbox before touching any console or CLI.

### Merge gates (non-negotiable)

- [ ] W4-10 (`fix(W4-10): Mux Data cookie`) is merged to `main` — required before public launch (Law 25 F-4).
- [ ] W4-11 (`fix(W4-11): Sentry span URL scrubber`) is merged, D-1 PoC is green — required before setting any `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] CI is green on `main` (secret-scan, verify, integration, e2e) — link the run URL here before proceeding.

### Client decisions (D1–D8, Q18–Q24)

Each row is a launch-blocker or an explicit accept-default. Write your decision in the last column.

| Ref | Decision | Default / action needed | Your decision |
|-----|----------|------------------------|---------------|
| D1 | Cancellation tiers + policy page text | Defaults in `cancellation-policy` global; populate content in Payload admin | |
| D2 | Video: Mux or launch without video | Block online-course launch until Mux prod credentials exist; in-person can launch without video | |
| D3 | Community URL (WhatsApp / Discord / Skool) | Set `site-settings.communityUrl` in Payload admin | |
| D4 | Brand assets + photos | Update `tokens.css` and seed content; Payload `media` for photos | |
| D5 | Launch date + courses ready | Set courses to `published` in Payload admin when ready | |
| D6 | GST/QST registration numbers + Stripe tax code | Set `STRIPE_TAX_ENABLED=true`, `STRIPE_TAX_CODE=txcd_...` only after CRA/Revenu Québec registrations complete | |
| D8 | Domain layout vs Shopify + email sending domain | Required before DNS step; decide subdomain vs root | |
| D11 / Q18 | Vercel: **separate Production project** (current project holds staging values); Pro plan | Create a NEW Vercel project for production — do not reuse the staging project; upgrade to Pro (Hobby forbids commercial use) | |
| Q22 | Waitlist retention after session end | 30 days (implemented) | |
| Q23 | Launch without Mux | Block online courses until Mux keys exist | |
| Q24 | W4-03c MEDIUM/LOW findings accepted for launch | See W4-03c Completion notes; each item has an explicit recommendation | |
| H-6 | R2 bucket public access | R2 bucket must have NO public access (no `r2.dev`, no custom domain) — verify before launch | |

### W4-03c launch conditions (security)

- [ ] **R2 bucket is private** (H-6): no public `r2.dev` subdomain, no custom public domain on the bucket. `R2_PUBLIC_URL` must point at a Workers-proxied or presigned-URL endpoint only. Failure = material files are publicly accessible by key.
- [ ] **`STRIPE_SECRET_KEY` is a live key** (G-4): must start with `sk_live_` or `rk_live_`. No `sk_test_` in production.
- [ ] **`VIDEO_FAKE_ALLOWED` is absent or false** (G-4): code guard refuses fake provider on `VERCEL_ENV=production`, but verify the env var is not set.
- [ ] **`NEXT_PUBLIC_SKIP_ENV_VALIDATION` is absent or `0`** (G-4).
- [ ] **`NODE_OPTIONS` is absent** (E): do not set `NODE_OPTIONS` to preload `stripe-redirect.cjs` or any other test shim.
- [ ] **`CSP_MODE` is absent or `enforce`** (G-4): default is `enforce`; never `report-only` in production.
- [ ] **Mux referrer allow-list configured** (H, residual L-4): in Mux dashboard, set allowed referrer domains to `https://<prod-domain>` and `https://admin.<prod-domain>` if applicable.
- [ ] **Sentry DSN not set until W4-11 is merged** (D-1): activating Sentry before D-1 is fixed leaks magic-link tokens in span data.
- [ ] **Daily error owner named** (H, Sentry inactive): designate who checks Vercel error logs + Stripe failed-webhook emails daily for the first 2 weeks after launch.

### Privacy (Law 25)

- [ ] Privacy policy page exists in Payload CMS (`pages` collection) with FR and EN slugs (e.g. `/fr/politique-de-confidentialite`, `/en/privacy-policy`).
- [ ] Footer link to privacy policy page exists (F-5): add link to `SiteFooter` referencing the CMS slug after the page is published.
- [ ] Privacy policy lists Sentry as a sub-processor with the chosen data-residency region (EU/de or US) if DSN is set.

---

## 0. Go/no-go gate

**Actor:** Erick  
**Where:** this document, in writing

```
Checklist complete (all boxes above ticked): YES / NO
W4-10 merged: YES / NO
W4-11 merged (or DSN will not be set): YES / NO
CI green on main (run URL): _____________________
W4-03c GO line confirmed (0 CRIT, 0 HIGH): YES
Client decisions D1–D8 resolved: YES / NO
Erick written approval line: "I approve production launch on YYYY-MM-DD."
```

Do not proceed until every line above is filled.

---

## 1. Decisions closed before launch

Review and close each of D1–D8, Q18–Q24 from the pre-flight checklist. Write your decisions in
the table above and confirm they are reflected in Vercel env vars, Payload admin content, and
Stripe settings at each step below.

---

## 2. Vercel: create production project (Q18, D11)

**Actor:** Erick  
**Prerequisite:** D8 (domain) and D11 (Pro plan) decided.

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 2.1 | Create a **new** Vercel project (do NOT reuse `cook-for-friends`; that project's Production environment holds staging values). | New project created with a unique name, e.g. `cook-for-friends-prod`. | — |
| 2.2 | Upgrade to Vercel Pro (required for commercial use; D11). | Plan shows Pro. | Contact Vercel support if billing fails. |
| 2.3 | Connect GitHub repo `bnzo-labs/cook-for-friends`, root directory `apps/web`, Node.js version 22. | Build triggered automatically. | If build fails at this step, it uses staging env vars — see §3 first. |
| 2.4 | Set the build command exactly as `vercel.json` specifies (default: `next build`). Framework: Next.js. | Build uses the same command as CI. | — |
| 2.5 | Settings → Deployment Protection → **disable "Vercel Authentication"** for the Production deployment. | Public requests reach the site without SSO prompt. | Do not disable on the Preview URL — staging protection stays on. |
| 2.6 | Add custom domain (D8): `<prod-domain>` (apex and `www`). Configure DNS `A`/`CNAME`/`ALIAS` per Vercel instructions. Set `www` → 301 redirect to apex (or vice versa, per D8 decision). | Vercel shows "Valid configuration" for the domain. DNS TTL 300 for fast propagation. | If DNS conflict with Shopify (D8): coordinate subdomain approach. |
| 2.7 | Set `NEXT_PUBLIC_SITE_URL=https://<prod-domain>` in Vercel env (Production scope). | Build inlines the correct canonical URL. | — |
| **Verify** | `curl -I https://<prod-domain>/fr` returns 200; `curl -I https://www.<prod-domain>/fr` returns 301. | | Roll back: remove custom domain from Vercel, repoint DNS to previous target. |

---

## 3. Production environment variables

**Actor:** Erick  
**Where:** Vercel dashboard → new production project → Settings → Environment Variables → Production scope.

Set every variable below. Leave no key with a staging/test value. Verify each with the check command (name only, never print the value).

### 3.1 Full variable table

| Key | Value source | Secret | Scope | Notes |
|-----|-------------|--------|-------|-------|
| `DATABASE_URL` | Neon `main` branch → **pooled** connection string | YES | Production | Neon dashboard → main branch → Connection → Pooled |
| `DATABASE_URL_DIRECT` | Neon `main` branch → **direct** connection string | YES | Production | Same branch, non-pooled (for migrations) |
| `PAYLOAD_SECRET` | Generate: `openssl rand -hex 32` | YES | Production | Must differ from staging value. Store in a password manager. |
| `NEXT_PUBLIC_SITE_URL` | `https://<prod-domain>` | no | Production | Set in step 2.7 |
| `SEO_INDEXABLE_HOSTS` | `<prod-domain>` | no | Production | Only the prod hostname; staging must not be indexable |
| `STRIPE_SECRET_KEY` | Stripe dashboard → live restricted key (Developers → API keys) | YES | Production | Must start with `sk_live_` or `rk_live_`. Never `sk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | Created in step 5 (Stripe live webhook endpoint) | YES | Production | Starts with `whsec_`. Set after creating the endpoint in §5. |
| `STRIPE_TAX_ENABLED` | `true` or `false` (D6) | no | Production | Set `true` only after GST/QST registered (D6). |
| `STRIPE_TAX_CODE` | Stripe tax code for courses (D6, e.g. `txcd_10000000`) | no | Production | Required if `STRIPE_TAX_ENABLED=true`. |
| `RESEND_API_KEY` | Resend dashboard → API key (created for the prod domain) | YES | Production | Scope: send emails only |
| `EMAIL_FROM` | `noreply@<email-sending-domain>` (D8) | no | Production | Must match the verified Resend domain |
| `EMAIL_REPLY_TO` | `hello@<email-sending-domain>` (optional, D8) | no | Production | |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → Overview | YES | Production | Production R2 account |
| `R2_ACCESS_KEY_ID` | Cloudflare dashboard → R2 → Manage R2 API tokens | YES | Production | Use a **separate** token from staging |
| `R2_SECRET_ACCESS_KEY` | Same token creation flow | YES | Production | |
| `R2_BUCKET` | Name of the production R2 bucket (separate from staging bucket) | no | Production | Create a new bucket; staging bucket must NOT be reused |
| `R2_PUBLIC_URL` | URL of the Workers-proxied R2 endpoint (not the public `r2.dev` domain) | no | Production | H-6: bucket must be private; this URL must NOT be a publicly readable `r2.dev` URL |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` | YES | Production | Must differ from staging. Used to authenticate the Cloudflare cron worker. |
| `VIDEO_PROVIDER` | `mux` (or `none` if D2 = no video at launch) | no | Production | Never `fake`. |
| `MUX_TOKEN_ID` | Mux production environment (created in §7) | YES | Production | Required if `VIDEO_PROVIDER=mux` |
| `MUX_TOKEN_SECRET` | Mux production environment | YES | Production | Required if `VIDEO_PROVIDER=mux` |
| `MUX_SIGNING_KEY_ID` | Mux production environment → Signing keys | YES | Production | Required if `VIDEO_PROVIDER=mux` |
| `MUX_SIGNING_KEY_PRIVATE` | Mux production environment → Signing keys (base64) | YES | Production | Required if `VIDEO_PROVIDER=mux` |
| `MUX_WEBHOOK_SECRET` | Created in §7 (Mux webhook endpoint) | YES | Production | Required if `VIDEO_PROVIDER=mux` |
| `SENTRY_DSN` | Sentry project DSN (created in §9) | no | Production | **Leave blank until W4-11 is merged (D-1).** Same value as `NEXT_PUBLIC_SENTRY_DSN`. |
| `NEXT_PUBLIC_SENTRY_DSN` | Same as `SENTRY_DSN` | no | Production | DSN is not secret; `NEXT_PUBLIC_` prefix makes it available to the client bundle. |
| `SENTRY_ENVIRONMENT` | `production` | no | Production | |
| `SENTRY_ORG` | Sentry org slug | no | Production (build only) | Required for source map upload during build. |
| `SENTRY_PROJECT` | Sentry project slug | no | Production (build only) | |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → scope `project:releases` + `org:read` | YES | Production (build only) | Rotate yearly or on suspected leak. |
| `CSP_MODE` | (absent, or `enforce`) | no | Production | Default is `enforce`; leave absent or set `enforce`. Never `report-only`. |

### 3.2 Variables that MUST NOT be present in production

If any of these exist, remove them before deploy:

| Key | Reason |
|-----|--------|
| `VIDEO_FAKE_ALLOWED` | Fake video provider must never run in production |
| `PAYLOAD_DB_PUSH` | Schema push corrupts Neon enums; never in any shared environment |
| `NEXT_PUBLIC_SKIP_ENV_VALIDATION` | Disables env validation at boot; never in production |
| `NODE_OPTIONS` | Must not preload test shims (fake-stripe, stripe-redirect) |
| Any value starting with `sk_test_` or `rk_test_` | Test Stripe keys must never reach production |
| Any value starting with `whsec_` from the staging webhook | Staging webhook secret must not be reused |

### 3.3 Verify env vars are set (production)

After setting all variables, re-deploy and check the build log for `❌ Missing / invalid` lines
from `src/lib/env.ts`. A clean boot has no env validation errors.

Spot-check command (names only — never print values):
```bash
vercel env ls --environment production | grep -E "DATABASE_URL|STRIPE_SECRET|SENTRY_DSN|CRON_SECRET"
```

---

## 4. Database: Neon `main` (production)

**Actor:** Erick  
**Where:** Neon dashboard + local terminal (clean checkout of the release SHA).

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 4.1 | Create a restore branch from `main` before any migration: `neonctl branches create --name pre-launch-$(date +%F) --parent main`. Record the branch name. | Branch appears in Neon dashboard. | — |
| 4.2 | In a clean local checkout at the release SHA (the merge commit on `main` that CI is green on), run: `DATABASE_URL_DIRECT=<Neon main direct URL> pnpm -C apps/web payload migrate`. | Output shows each migration applied; no errors. | If a migration fails: **stop**, do not continue. Roll back = restore from `pre-launch-<date>` (see §12). |
| 4.3 | Verify: `SELECT slug FROM payload_migrations ORDER BY updated_at;` on the Neon `main` branch. Compare to `apps/web/src/migrations/*.ts` file list. Counts must match. | All migration slugs present, in order. | — |
| 4.4 | Do **not** run `pnpm seed` on production. | — | — |
| 4.5 | In Payload admin (`https://<prod-domain>/admin`): go to `/admin/create-first-user` and create the admin account. Use a strong unique password stored in a password manager. | Admin account created; `/admin/login` works. | — |
| 4.6 | Create additional staff user accounts for the team. | Staff can log in. | — |
| 4.7 | Populate globals in Payload admin: `site-settings` (community URL D3, max seats, waitlist count), `cancellation-policy` (tiers D1). | Settings saved with no validation errors. | — |
| 4.8 | Create CMS pages: home page (FR + EN), privacy policy (FR + EN, Law 25 F-5), any other static pages needed for launch. | Pages appear in Payload → Pages list. | — |
| **Verify** | `GET https://<prod-domain>/fr` returns 200 with correct content. | | Rollback §12.B. |

---

## 5. Stripe live

**Actor:** Erick  
**Where:** Stripe dashboard (live mode — confirm the toggle shows "Live" not "Test").

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 5.1 | Complete Stripe account activation (identity verification, banking, business info). | Dashboard shows no "Activate your account" banner. | Stripe support. |
| 5.2 | Register GST/QST if applicable (D6): Stripe dashboard → Tax → Registrations → Add. | Tax registrations show "Active". | Only required if `STRIPE_TAX_ENABLED=true`. |
| 5.3 | Set `STRIPE_TAX_CODE` env var (D6, e.g. `txcd_10000000` for general services). | — | Verify at checkout before go-live. |
| 5.4 | Configure branding: Stripe → Settings → Branding. Add logo, brand colour. Set receipt email footer with FR/EN contact info. | Stripe-hosted checkout page shows brand. | — |
| 5.5 | Create the production webhook endpoint in Stripe dashboard → Developers → Webhooks → Add endpoint: URL = `https://<prod-domain>/api/stripe/webhook`, API version = `2026-08-26.dahlia`, events = the 6 CONTRACT §6 events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `invoice.finalized`. | Endpoint shows "Enabled". | — |
| 5.6 | Copy the webhook signing secret (`whsec_...`) from the endpoint detail page. Set `STRIPE_WEBHOOK_SECRET=<value>` in Vercel production env. Redeploy. | Webhook delivery test from Stripe dashboard returns 200. | If 400: check raw-body parsing; if 500: check Sentry or Vercel logs. |
| 5.7 | In Payload admin: for each published course, verify the course has a Stripe Product ID and Price ID. If not: open the course in the admin, make a minor edit (e.g. save again) to trigger the `afterChange` sync hook. | Each published course shows `stripeProductId` and `stripePriceId` in the admin detail. | Catalog sync broken: check Vercel function logs for `stripe.products.create` errors. |
| 5.8 | Re-save each discount code in Payload admin to create live Stripe coupons (staging coupons are on the test Stripe account and do not exist in live). | Each discount code shows a `stripeCouponId` in the admin. | — |
| 5.9 | Confirm **no test objects** are referenced: `stripe products list --api-key sk_live_...` should not show test-mode products. | Only live products visible. | — |
| **Verify** | Stripe dashboard → Developers → Events: no unexpected errors. Webhook logs show 2xx only. | | Disable webhook endpoint, see §12.D. |

---

## 6. Resend (email)

**Actor:** Erick  
**Where:** Resend dashboard + DNS registrar.

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 6.1 | Add and verify the email sending domain (D8) in Resend: Domains → Add domain → enter `<email-sending-domain>`. | Resend shows the DNS records to add (SPF, DKIM, DMARC). | — |
| 6.2 | Add the DNS records at your registrar. Wait for propagation (up to 48 h, usually < 1 h). | Resend domain status shows "Verified". | If TXT record conflicts with Shopify SPF: merge the `include:` statements in one SPF record. |
| 6.3 | Create a Resend API key scoped to send-only. Set `RESEND_API_KEY` in Vercel production env. Set `EMAIL_FROM=noreply@<email-sending-domain>`. Redeploy. | Key created. | — |
| 6.4 | Test send: from Vercel logs, trigger a magic-link request (`POST /api/auth/magic-link/request`) with your own email address. Confirm the email arrives in your inbox from `noreply@<email-sending-domain>`. | Email received; FROM address correct; no spam folder. | Check Resend dashboard → Logs for bounce/block. |
| **Verify** | Resend dashboard → Domains: "Verified". Sent email visible in Resend logs. | | Repoint `EMAIL_FROM` to a previously verified domain if the new domain fails verification. |

---

## 7. Mux (video — required if D2 = Mux)

Skip this section entirely if D2 = no video at launch (`VIDEO_PROVIDER=none`).

**Actor:** Erick  
**Where:** Mux dashboard.

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 7.1 | Create a **production Mux environment** (separate from any test environment). | New environment visible in Mux dashboard. | — |
| 7.2 | Create a Mux token (Access Token → Generate new token) with environment `production`. Set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` in Vercel production env. | — | — |
| 7.3 | Create a signing key: Mux dashboard → Settings → Signing Keys → Generate a new key. Download the PEM. Set `MUX_SIGNING_KEY_ID` and `MUX_SIGNING_KEY_PRIVATE` (base64 of the PEM) in Vercel production env. | Key appears in the list. | — |
| 7.4 | Create a Mux webhook endpoint: Mux dashboard → Settings → Webhooks → Add webhook endpoint → URL = `https://<prod-domain>/api/video/webhook`. Scope: all video events. Set `MUX_WEBHOOK_SECRET` in Vercel production env. | Webhook shows "Active". | — |
| 7.5 | Configure the **referrer allow-list** in Mux playback policy or playback restriction settings: allow `https://<prod-domain>` only (H residual L-4). | Policy saved. | — |
| 7.6 | Set `VIDEO_PROVIDER=mux` in Vercel production env. Redeploy. | — | — |
| 7.7 | Upload one lesson video through the Payload admin (Lessons → edit a lesson → Video field). Wait for `ready` status. | Lesson shows `video.status = ready` in Payload. | Check Vercel function logs for `mux.video.assets.create` errors. |
| 7.8 | Test playback: log in as an entitled customer, open the lesson player. Video plays. | Player loads; no console errors; CSP allows `*.mux.com *.litix.io`. | Check browser console for CSP violations. |
| **Verify** | Mux dashboard → Monitoring: no error events. `muxData` cookie absent in browser DevTools (W4-10 must be merged). | | Disable webhook endpoint, set `VIDEO_PROVIDER=none` as fallback. |

---

## 8. Cron worker (Cloudflare Workers)

**Actor:** Erick  
**Where:** local terminal with `wrangler` logged in.

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 8.1 | `cd infra/cron-worker` | — | — |
| 8.2 | `pnpm exec wrangler login` (if not already authenticated). | Cloudflare account accessible. | — |
| 8.3 | Set the production `CRON_SECRET` (must match the value set in Vercel production env in §3): `pnpm exec wrangler secret put CRON_SECRET --env production`. | Prompted to enter the secret; no echo. | — |
| 8.4 | The production environment does **not** use `VERCEL_BYPASS_SECRET` (Deployment Protection is disabled for the prod public domain — step 2.5). Do not set that secret for the production environment. | — | — |
| 8.5 | Deploy: `pnpm exec wrangler deploy --env production`. | Output shows "Deployed to cff-cron-prod". | If deploy fails: check `wrangler.toml` `[env.production]` block matches the prod origin. |
| 8.6 | Tail logs: `pnpm exec wrangler tail --env production`. Wait for the next `*/5` cron tick (up to 5 min). | Logs show 200 responses for `expire-holds` and `jobs` routes. | If 401: `CRON_SECRET` mismatch — re-set the secret and redeploy. If 500: check Vercel function logs for the cron handler. |
| 8.7 | Wait for the next hourly tick. | Log shows 200 for `reminders` route. | — |
| **Verify** | `wrangler tail --env production` shows only 200s for all three routes over at least two `*/5` ticks. | | Delete triggers or worker: `wrangler delete --env production` or `wrangler triggers delete --env production`; see §12.D. |

---

## 9. Sentry

> **Gate:** do not proceed with this section until W4-11 (D-1 fix) is merged and the PoC test
> `apps/web/test/security/w4-sentry-span-url.test.ts` is green.

**Actor:** Erick  
**Where:** Sentry dashboard.

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 9.1 | Create a Sentry org and project `cook-for-friends` (platform: Next.js). Choose **EU (de)** data residency for Law 25 compliance (or US only if you accept cross-border transfer; the choice is permanent). | Project created. DSN visible. | — |
| 9.2 | Settings → Security & Privacy: enable **Data Scrubber**, **Use Default Scrubbers**, **Prevent Storing of IP Addresses**. | All three enabled. | — |
| 9.3 | Set env vars in Vercel production env: `SENTRY_DSN` (server config), `NEXT_PUBLIC_SENTRY_DSN` (same value, client config), `SENTRY_ENVIRONMENT=production`. Redeploy. | Build succeeds. | — |
| 9.4 | Set Vercel production (build only) env vars: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (scope: `project:releases` + `org:read`). Redeploy. | Source maps uploaded during build; Sentry shows a release. `.next/static/**/*.map` must NOT be publicly accessible (verify: `curl -I https://<prod-domain>/_next/static/<any>.js.map` returns 404). | — |
| 9.5 | Create alert rules per `infra/sentry/README.md` (rules a–d). | Alert rules visible in Sentry → Alerts. | — |
| 9.6 | Trigger a test error: use a Vercel preview deploy with DSN set, call a route that will throw (e.g. a cron handler with a bad DB URL on a throwaway preview). | Event appears in Sentry. No cookie / no email / no request body in the event payload. | If PII appears: halt, unset DSN, revert to W4-04 for a scrubber fix. |
| 9.7 | Confirm `/monitoring` returns 200/204 to a POST request (Sentry tunnel). | No CSP violation in browser console. | — |
| **Verify** | Sentry dashboard shows the production release. No unexpected events. `.map` files return 404. | | Remove DSN vars from Vercel env and redeploy to disable. |

---

## 10. Deploy

**Actor:** Erick  
**Where:** Vercel dashboard (new production project).

| Step | Action | Expected result | Abort |
|------|--------|----------------|-------|
| 10.1 | Confirm all env vars from §3 are set in the production project. | `vercel env ls --environment production` shows all keys. | — |
| 10.2 | In Vercel dashboard: Deployments → find the deployment for the approved release SHA. Click **Promote to Production** (or redeploy from that commit). | Build starts. | — |
| 10.3 | Watch the build log. | Build completes without `❌ Missing / invalid env` errors from `src/lib/env.ts`. | If env error: add the missing key and promote again. |
| 10.4 | After build: `curl -I https://<prod-domain>/fr` from your machine. | 200. Response headers include `x-frame-options: DENY`, `x-content-type-options: nosniff`, `strict-transport-security`, `content-security-policy` with `default-src 'self'`. | If CSP missing: check `CSP_MODE` env var (must be absent or `enforce`). |
| 10.5 | `curl -I https://<prod-domain>/robots.txt` | Returns 200. Body contains `Allow: /` and `Disallow:` only on the staging domain. The prod host must be in `SEO_INDEXABLE_HOSTS`. | — |
| 10.6 | `curl https://<prod-domain>/sitemap.xml` | Returns 200; XML contains prod URLs. | — |
| **Verify** | Site loads at `https://<prod-domain>/fr` and `https://<prod-domain>/en`. | | Rollback §12.A. |

---

## 11. Post-deploy smoke (W2-12 real-infra criteria)

**Actor:** Erick (or orchestrator only with explicit Erick OK)  
**When:** within 5 minutes of deploy completing.

These tests use real credentials and real email addresses. Each test should be completed and
verified before moving to the next.

| Step | Test | Expected result | Abort |
|------|------|----------------|-------|
| 11.1 | `GET https://<prod-domain>/fr` and `/en` | Both return 200. | Rollback §12.A. |
| 11.2 | Robots: `curl https://<prod-domain>/robots.txt` | `Allow: /` for the prod host; staging host in `Disallow:`. | Fix `SEO_INDEXABLE_HOSTS` env var. |
| 11.3 | Sitemap: `curl https://<prod-domain>/sitemap.xml` | 200; well-formed XML; prod URLs only. | — |
| 11.4 | Headers: `curl -I https://<prod-domain>/fr` | CSP header present; `CSP_MODE` = enforce (not `report-only`); HSTS `max-age=31536000`; `X-Frame-Options: DENY`. | Redeploy with correct `CSP_MODE`. |
| 11.5 | **In-person purchase smoke** (use a real low-price course or a 100 % discount code with a live card): purchase 2 seats (buyer + 1 guest). | (a) Stripe dashboard → Payments: payment shows as "Succeeded". (b) Buyer receives `order-confirmation` email with `.ics` from `noreply@<email-sending-domain>`. (c) Guest receives `enrollment-confirmation` email with `.ics`. (d) Payload admin → Enrollments: 2 enrollments exist for the session. (e) Webhook dashboard (Stripe → Developers → Webhooks → endpoint): all events show 2xx. | If any step fails: **do not proceed**. Check Vercel function logs, Stripe event log, Resend logs. |
| 11.6 | **Staff full refund**: in Payload admin, open one of the enrollments from step 11.5. Cancel it with mode `full`. | (a) Stripe dashboard: refund appears against the original payment. (b) Entitlement revoked in Payload → Entitlements (if online), or enrollment status = `refunded`. (c) `refund-issued` email sent to buyer. | Abort and investigate in Vercel function logs. |
| 11.7 | **Online purchase smoke** (requires D2 = Mux and a published online course): purchase 1 seat. | (a) Buyer receives email with magic link. (b) Buyer follows magic link, logs in. (c) Portal → My Courses shows only the purchased course. (d) Player loads the first lesson video. | If player fails: check Mux referrer allow-list, CSP `media-src`. |
| 11.8 | **Vercel Ready**: Vercel dashboard shows `Ready` status for the production deployment. | Green check. | — |
| 11.9 | **Cloudflare cron ticks** (W4-06 §8): `wrangler tail --env production` during the smoke window. | At least one successful tick per route (200) visible. | Investigate §8 abort. |
| 11.10 | **Resend delivery** (W4-01 / W2-12): emails from steps 11.5–11.7 delivered within 2 minutes; check Resend dashboard → Logs. | All emails show "Delivered". No bounces. | Check DNS, `EMAIL_FROM` matches verified domain. |
| 11.11 | **Sentry** (if DSN is set): no unexpected events appear in Sentry dashboard. If no DSN: confirm Vercel logs show no unhandled exceptions. | Clean. | Investigate any unexpected events before continuing. |
| 11.12 | **Stripe webhook 2xx only**: Stripe → Developers → Webhooks → endpoint → Recent deliveries. | All recent deliveries show 2xx. | If any 5xx: investigate handler; rollback or hotfix. |

---

## 12. Rollback

Time budget: diagnose within 5 minutes; execute rollback within 10 minutes.

### 12.A — Code rollback (Vercel)

Fastest; use this for any application-layer issue.

```
Vercel dashboard → Production project → Deployments → 
  previous deployment → ⋯ → Promote to Production
```

Expected: within 1–2 minutes the previous version serves traffic. Verify: `curl -I https://<prod-domain>/fr` returns 200.

### 12.B — Database rollback

Migrations are forward-only in normal operation. Use this only if the launch migration caused
data corruption and no customer payments have been processed yet.

```
# Neon dashboard → Branches → pre-launch-<date>
# Reset or promote: branch restore flow
# OR: run the specific down() for the launch migration set only
pnpm -C apps/web payload migrate:down
```

**Data loss window:** any writes between the migration run (§4.2) and the restore moment are
lost. State clearly in customer communications if any orders or enrollments are affected.

If customer payments have already been processed: **do not roll back the database**. Issue
refunds manually via Stripe, correct data via Payload admin, and deploy a hotfix.

### 12.C — Stripe

If live Stripe is misconfigured and you need to stop incoming payments:

1. Stripe dashboard → Developers → Webhooks → Production endpoint → Disable.
2. Stripe dashboard → Products → archive live Products if relaunching from scratch.
3. Redeploy with `VIDEO_PROVIDER=none` and/or `STRIPE_SECRET_KEY` temporarily unset to
   take the checkout flow offline.

### 12.D — Cron worker

If the cron worker is sending malformed requests or causing errors:

```bash
cd infra/cron-worker
# Option 1: delete the triggers only (worker stays)
pnpm exec wrangler triggers delete --env production
# Option 2: delete the entire worker
pnpm exec wrangler delete --env production
```

### 12.E — Customer communications template

Send to affected customers if orders or entitlements are impacted:

```
FR: Bonjour, nous avons rencontré un problème technique lors du lancement. 
    Votre paiement n'a pas été débité / a été remboursé intégralement sous 5 à 10 jours ouvrables.
    Contactez-nous à hello@<email-sending-domain> pour toute question.

EN: Hello, we encountered a technical issue during launch.
    Your payment was not charged / has been fully refunded within 5–10 business days.
    Contact us at hello@<email-sending-domain> with any questions.
```

---

## 13. Day-1 and Day-7 checks

### Daily (first 2 weeks, while Sentry is inactive or new)

Designated owner: `____________________` (name the person in the pre-flight checklist)

- [ ] Vercel error log: Vercel dashboard → Functions → check for 5xx spikes.
- [ ] Stripe failed-webhook emails: Stripe sends automated emails when webhooks return 5xx after retries. Check the inbox used for the Stripe account.
- [ ] Resend bounce log: Resend dashboard → Logs → filter by "Bounced" or "Complained".

### Day-7 review

- [ ] Sentry error digest (if DSN is set): review open issues.
- [ ] Stripe disputes/refunds: Stripe dashboard → Payments → Disputes; Stripe → Payments → Refunds.
- [ ] Neon usage: Neon dashboard → Usage — confirm production branch is not nearing limits.
- [ ] Lighthouse staging dispatch: run `gh workflow run lighthouse-staging.yml` against the production URL to get a Lighthouse score. Confirm performance ≥ 90, accessibility ≥ 90.

---

## Secrets rotation schedule

| Secret | Rotation trigger | Dependents | Owner |
|--------|-----------------|-----------|-------|
| `STRIPE_SECRET_KEY` | Suspected leak | Stripe live API, all payment flows | Erick |
| `STRIPE_WEBHOOK_SECRET` | Suspected leak | Live webhook endpoint | Erick |
| `PAYLOAD_SECRET` | Suspected leak | Staff sessions, customer magic links, waitlist remove tokens (all invalidated on rotation) | Erick |
| `RESEND_API_KEY` | Annually or on leak | Email delivery | Erick |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Suspected leak | Media uploads + presigned URLs | Erick |
| `CRON_SECRET` | Annually or on leak | Cron worker auth (`cff-cron-prod` worker) | Erick |
| `MUX_TOKEN_SECRET` | Annually or on leak | Video upload + playback | Erick |
| `MUX_SIGNING_KEY_PRIVATE` | On MUX signing key rotation | Playback token signing | Erick |
| `SENTRY_AUTH_TOKEN` | Annually or on leak | Source map upload during builds | Erick |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | After W4-13 merges (F-3); then annually | Staging Deployment Protection bypass (`lighthouse-staging.yml`) | Erick |

**Rotation procedure for any secret:**
1. Generate the new value.
2. Update in Vercel environment variables (and in the cron worker via `wrangler secret put` if applicable).
3. Redeploy.
4. Verify the affected flows still work.
5. Record the rotation date here.

---

## Change log

| Date | Action | Actor |
|------|--------|-------|
| 2026-11-21 | Runbook created (W4-06, devops-agent) | devops-agent |

---

## References

- `apps/web/src/lib/env.ts` — authoritative env var schema
- `infra/sentry/README.md` — Sentry setup and alert rules
- `infra/cron-worker/wrangler.toml` — cron worker config (see `[env.production]`)
- `infra/cron-worker/README.md` — cron worker deploy + rotation instructions
- `docs/CONTRACT.md` §5.1, §6 — routes + Stripe events
- `docs/MASTER_BUILD_SPEC.md` §6–§10 — env vars, decisions, NFRs, acceptance criteria
- `tasks/W4-03c-final-security-review.md` — security findings + GO/NO-GO
- `tasks/W4-13-ci-hardening.md` — CI hardening (F-1, F-2, F-3)
