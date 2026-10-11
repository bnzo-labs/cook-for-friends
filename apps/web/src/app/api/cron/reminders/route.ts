import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/cron/reminders
 *
 * Triggered by Vercel Cron hourly (see vercel.json).
 * Delegates to scheduling.sendDueReminders (W3-05).
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // TODO: W3-05 — import and call scheduling.sendDueReminders()
  return NextResponse.json({ ok: true })
}
