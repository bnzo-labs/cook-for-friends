import type { ModuleError } from "@/modules/_shared"
import { forbiddenOrigin, getCurrentCustomer, isAllowedOrigin, jsonResponse, readBody } from "@/modules/identity"
import { postComment } from "@/modules/learning"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(error: ModuleError): Response {
  switch (error.code) {
    case "VALIDATION":
      return jsonResponse(400, {
        ok: false,
        error: { code: "VALIDATION", messageKey: "errors.VALIDATION", details: { issues: error.issues }, issues: error.issues },
      })
    case "FORBIDDEN":
      return jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", messageKey: "errors.FORBIDDEN" } })
    case "CONFLICT":
      if (error.reason === "RATE_LIMITED") {
        return jsonResponse(429, { ok: false, error: { code: "RATE_LIMITED", messageKey: "learning.comments.rateLimited" } })
      }
      return jsonResponse(409, { ok: false, error: { code: "CONFLICT", messageKey: "errors.CONFLICT" } })
    default:
      return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}

/**
 * POST /api/comments — CONTRACT §5.1. Customer session + entitlement, Origin
 * check, 10/customer/h. `{ lessonId, body, parentId? }` → 201 `{ status: "pending" }`.
 * The body is never logged.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()
  try {
    const customer = await getCurrentCustomer(request.headers)
    if (!customer) return jsonResponse(401, { ok: false, error: { code: "UNAUTHORIZED", messageKey: "errors.FORBIDDEN" } })

    const raw = await readBody(request)
    const result = await postComment({
      customerId: customer.id,
      lessonId: raw.lessonId as never,
      body: raw.body as never,
      parentId: raw.parentId as never,
    })
    if (!result.ok) return errorResponse(result.error)
    return jsonResponse(201, { ok: true, data: { status: "pending" } })
  } catch (error) {
    console.error("[learning] POST /api/comments failed", error instanceof Error ? error.message : "unknown")
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
