import { NextRequest, NextResponse } from "next/server"

import { sendDueReminders } from "@/modules/scheduling"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cron/reminders
 *
 * Triggered hourly (Cloudflare cron worker, see infra/cron-worker/README.md).
 * Delegates to scheduling.sendDueReminders. Safe to run concurrently or twice:
 * exactly-once per (enrollment, offset) via `reminder-deliveries`.
 *
 * Auth: Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { sent } = await sendDueReminders()
    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    console.error("[scheduling] GET /api/cron/reminders failed", error)
    return NextResponse.json({ ok: false, error: "Reminder run failed" }, { status: 500 })
  }
}
