import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/cron/jobs
 *
 * Triggered by Vercel Cron every 5 minutes (see vercel.json).
 * Runs Payload's Jobs Queue (email sends, Stripe sync, etc.).
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // TODO: W2-04+ — import getPayload and call payload.jobs.run()
  return NextResponse.json({ ok: true })
}
