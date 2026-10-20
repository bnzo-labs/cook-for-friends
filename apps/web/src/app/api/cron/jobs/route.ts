import { NextRequest, NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Max jobs processed per invocation (worker calls every 5 min). */
const JOBS_LIMIT = 50

/**
 * GET /api/cron/jobs
 *
 * Driven by the Cloudflare cron worker (infra/cron-worker). Runs Payload's
 * Jobs Queue (email sends, Stripe sync, ...). With zero registered tasks the
 * queue is disabled; returns ran: 0 without throwing.
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const payload = await getPayload({ config })
  if (!payload.config.jobs.enabled) {
    return NextResponse.json({ ok: true, ran: 0 })
  }

  const result = await payload.jobs.run({ limit: JOBS_LIMIT })
  const ran = Object.keys(result.jobStatus ?? {}).length
  return NextResponse.json({ ok: true, ran })
}
