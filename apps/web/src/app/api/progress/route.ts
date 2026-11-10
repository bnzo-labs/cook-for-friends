import { z } from "zod"

import { moduleErrorResponse } from "@/modules/commerce"
import { consumeRateLimit, forbiddenOrigin, isAllowedOrigin, jsonResponse, readBody } from "@/modules/identity"
import { getRequestActor, recordProgress } from "@/modules/learning"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RATE_LIMIT = { scope: "email", namespace: "learning-progress", limit: 600, windowSeconds: 3600 } as const

const idSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,15}$/).transform(Number)])

const bodySchema = z.object({
  lessonId: idSchema,
  completed: z.boolean().optional(),
  positionSec: z.number().finite().min(0).max(1_000_000).optional(),
})

/**
 * POST /api/progress — CONTRACT §5.1 (W3-03a). Customer + entitlement, Origin
 * check, 600/customer/h. `{ lessonId, completed?, positionSec? }` →
 * `{ courseCompleted, certificateId? }`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  try {
    const actor = await getRequestActor(request.headers)
    if (actor?.kind !== "customer") {
      return jsonResponse(401, { ok: false, error: { code: "FORBIDDEN", messageKey: "errors.FORBIDDEN" } })
    }

    const parsed = bodySchema.safeParse(await readBody(request))
    if (!parsed.success) {
      const { status, body } = moduleErrorResponse({
        code: "VALIDATION",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      })
      return jsonResponse(status, body)
    }

    const limit = await consumeRateLimit({ ...RATE_LIMIT, key: `customer:${actor.id}` })
    if (!limit.allowed) {
      return jsonResponse(
        429,
        { ok: false, error: { code: "CONFLICT", messageKey: "learning.errors.rateLimited" } },
        { "retry-after": String(limit.retryAfterSeconds) },
      )
    }

    const result = await recordProgress({ customerId: actor.id, ...parsed.data })
    if (result.ok) return jsonResponse(200, { ok: true, data: result.data })
    const { status, body } = moduleErrorResponse(result.error)
    return jsonResponse(status, body)
  } catch (error) {
    console.error("[learning] POST /api/progress failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
