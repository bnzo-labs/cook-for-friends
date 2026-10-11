import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/cron/expire-holds
 *
 * Triggered by Vercel Cron every 5 minutes (see vercel.json).
 * Delegates to commerce.expireStaleHolds (W2-02).
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // TODO: W2-02 — import and call commerce.expireStaleHolds()
  return NextResponse.json({ ok: true })
}
