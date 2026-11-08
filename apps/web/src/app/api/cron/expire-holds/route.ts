import { NextRequest, NextResponse } from "next/server"

import { expireStaleHolds } from "@/modules/commerce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cron/expire-holds
 *
 * Driven by the Cloudflare cron worker every 5 minutes (infra/cron-worker).
 * Delegates to commerce.expireStaleHolds (W2-04).
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
    const { expired, checkoutSessionsExpired } = await expireStaleHolds()
    return NextResponse.json({ ok: true, expired, checkoutSessionsExpired })
  } catch (error) {
    console.error("[commerce] GET /api/cron/expire-holds failed", error)
    return NextResponse.json({ ok: false, error: "expire-holds failed" }, { status: 500 })
  }
}
