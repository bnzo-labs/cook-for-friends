import { z } from "zod"

import { consumeRateLimit, jsonResponse } from "@/modules/identity"
import { getMaterialSignedUrl, getRequestActor } from "@/modules/learning"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const notFound = () => jsonResponse(404, { ok: false, error: { code: "NOT_FOUND", messageKey: "errors.NOT_FOUND" } })
const rateLimited = (retryAfter: number) =>
  jsonResponse(429, { ok: false, error: { code: "CONFLICT", messageKey: "learning.errors.tooManyRequests" } }, { "retry-after": String(retryAfter) })
const idSchema = z.string().regex(/^[1-9]\d{0,15}$/)
/** W4-03b (W3-10 L-9): 120 signed URLs per customer per hour. Staff not counted. */
const RATE_LIMIT = { scope: "email", namespace: "learning-material", limit: 120, windowSeconds: 3600 } as const

/**
 * GET /api/materials/:id — CONTRACT §5.1 (moved to learning, CCR-W3-6). Customer
 * with an active entitlement to ANY course containing the material, or staff →
 * 302 to a 5-minute presigned R2 URL. Everything else → 404.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id: rawId } = await ctx.params
    const id = idSchema.safeParse(rawId)
    if (!id.success) return notFound()

    const actor = await getRequestActor(request.headers)
    if (actor?.kind === "customer") {
      const limit = await consumeRateLimit({ ...RATE_LIMIT, key: `customer:${actor.id}` })
      if (!limit.allowed) return rateLimited(limit.retryAfterSeconds)
    }
    const url = await getMaterialSignedUrl(Number(id.data), actor)
    if (!url) return notFound()
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } })
  } catch (error) {
    console.error("[learning] GET /api/materials/:id failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
