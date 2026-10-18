# cff-cron-staging (Cloudflare Worker)

Calls the app's `/api/cron/*` routes on a schedule. Replaces Vercel Cron on
staging (Hobby plan only runs cron once a day). Decision: DISCOVERY D11,
resolved 2026-10-18. Revisit Vercel Pro at launch.

| Cron (UTC)    | Routes called                                  |
|---------------|------------------------------------------------|
| `*/5 * * * *` | `/api/cron/expire-holds`, `/api/cron/jobs`     |
| `0 * * * *`   | `/api/cron/reminders`                          |

The cron-to-route map lives in `src/index.ts` (`CRON_ROUTES`) and must match
`[triggers] crons` in `wrangler.toml`. An unknown cron expression throws.

Each call sends:

- `Authorization: Bearer <CRON_SECRET>` (the app's check)
- `x-vercel-protection-bypass: <VERCEL_BYPASS_SECRET>` (staging has Vercel
  Deployment Protection; without it the request is redirected to SSO)

Behavior: 25 s timeout per call, redirects not followed (a 3xx means
protection blocked us), logs `path -> status` only, throws on any non-2xx so
Cloudflare records the invocation as failed. `fetch` always returns 404, so
there is no public trigger surface.

## Secrets

| Name | Source | Rotate |
|------|--------|--------|
| `CRON_SECRET` | Same value as `CRON_SECRET` in the Vercel staging env (`apps/web/.env.staging`) | When rotated in Vercel; update both sides together. Annually. |
| `VERCEL_BYPASS_SECRET` | Vercel -> Settings -> Deployment Protection -> Protection Bypass for Automation | On suspected leak (regenerate in Vercel, then `secret put` again). |

Never commit them. `.dev.vars` is gitignored.

## Deploy (Erick, one time)

1. Vercel dashboard -> project -> Settings -> Deployment Protection ->
   Protection Bypass for Automation -> create a secret. Copy it.
2. `cd infra/cron-worker && pnpm exec wrangler login`
3. `pnpm exec wrangler secret put CRON_SECRET` (paste staging value)
4. `pnpm exec wrangler secret put VERCEL_BYPASS_SECRET` (paste Vercel bypass)
   (Secrets before first deploy: wrangler offers to create the Worker. Say yes.)
5. `pnpm exec wrangler deploy`
6. `pnpm exec wrangler tail` and wait for the next `*/5` tick. Expect
   `cron /api/cron/expire-holds -> 200` and `... /jobs -> 200`.

Wrangler is pinned in `package.json` (4.144.0); use `pnpm exec wrangler` so the
pin is used.

## Rollback

`pnpm exec wrangler rollback` (previous Worker version), or delete the
triggers / Worker in the Cloudflare dashboard. Cron routes are idempotent
housekeeping; pausing them is safe (seat correctness never depends on cron,
DISCOVERY F2).

## Local development

```sh
# terminal 1: app
pnpm --filter web exec next dev -p 3100
# terminal 2: worker. Put CRON_SECRET (same as apps/web/.env.local) and any
# dummy VERCEL_BYPASS_SECRET in infra/cron-worker/.dev.vars (gitignored).
cd infra/cron-worker
pnpm exec wrangler dev --test-scheduled --port 8799 --var TARGET_URL:http://localhost:3100
curl "localhost:8799/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"   # 200
curl "localhost:8799/cdn-cgi/handler/scheduled?cron=0+*+*+*+*"     # 200
```

A wrong `CRON_SECRET` gives 500 from the worker (app returned 401).

## Checks

`pnpm typecheck` and `pnpm test` at repo root run this package through turbo
(CI picks it up). Or inside this folder: `pnpm typecheck && pnpm test`.
