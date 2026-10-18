/**
 * Cloudflare Worker: calls the app's /api/cron/* routes on a schedule.
 * Replaces Vercel Cron on staging (Hobby = daily only). See README.md.
 */

export interface Env {
  TARGET_URL: string
  CRON_SECRET: string
  VERCEL_BYPASS_SECRET: string
}

/** cron expression (must match wrangler.toml [triggers]) -> app routes */
export const CRON_ROUTES: Readonly<Record<string, readonly string[]>> = {
  "*/5 * * * *": ["/api/cron/expire-holds", "/api/cron/jobs"],
  "0 * * * *": ["/api/cron/reminders"],
}

const TIMEOUT_MS = 25_000

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

async function callRoute(
  path: string,
  env: Env,
  fetchFn: FetchFn,
): Promise<void> {
  const url = new URL(path, env.TARGET_URL).toString()
  const res = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      // Vercel "Protection Bypass for Automation"
      "x-vercel-protection-bypass": env.VERCEL_BYPASS_SECRET,
    },
    // A 3xx means Deployment Protection SSO redirect: treat as failure.
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  console.log(`cron ${path} -> ${res.status}`)
  // Drain body so the connection is released.
  await res.body?.cancel()
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`cron ${path} failed with status ${res.status}`)
  }
}

export async function runCron(
  cron: string,
  env: Env,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const routes = CRON_ROUTES[cron]
  if (!routes) {
    throw new Error(`unknown cron expression: ${cron}`)
  }
  const results = await Promise.allSettled(
    routes.map((r) => callRoute(r, env, fetchFn)),
  )
  const failed = results.flatMap((r, i) =>
    r.status === "rejected" ? [routes[i]] : [],
  )
  if (failed.length > 0) {
    // Messages carry path + status only, never secrets.
    throw new Error(`cron failed: ${failed.join(", ")}`)
  }
}

export default {
  // Awaited (not waitUntil) so a throw marks the invocation as failed.
  async scheduled(controller, env): Promise<void> {
    await runCron(controller.cron, env)
  },
  async fetch(): Promise<Response> {
    return new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
