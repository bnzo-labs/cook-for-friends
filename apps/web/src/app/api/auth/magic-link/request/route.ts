import {
  RATE_LIMITED_REASON,
  clientIp,
  forbiddenOrigin,
  isAllowedOrigin,
  jsonResponse,
  readBody,
  requestBodySchema,
  requestMagicLink,
} from "@/modules/identity"

export const dynamic = "force-dynamic"

/** CONTRACT §5.1: always `200 { ok: true }` for a valid body, known email or not. */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  const parsed = requestBodySchema.safeParse(await readBody(request))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    return jsonResponse(400, { ok: false, error: { code: "VALIDATION", messageKey: "errors.VALIDATION", issues } })
  }

  try {
    const result = await requestMagicLink({ ...parsed.data, ip: clientIp(request.headers) })
    if (result.ok) return jsonResponse(200, { ok: true })
    if (result.error.code === "CONFLICT" && result.error.reason === RATE_LIMITED_REASON) {
      return jsonResponse(
        429,
        { ok: false, error: { code: "RATE_LIMITED", messageKey: "errors.MAGIC_LINK_RATE_LIMITED" } },
        { "retry-after": "3600" },
      )
    }
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "errors.error_generic" } })
  } catch (error) {
    console.error("[identity] POST /api/auth/magic-link/request failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "errors.error_generic" } })
  }
}
