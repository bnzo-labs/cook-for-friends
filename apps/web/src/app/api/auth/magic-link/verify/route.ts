import {
  forbiddenOrigin,
  isAllowedOrigin,
  jsonResponse,
  readBody,
  verifyBodySchema,
  verifyMagicLink,
} from "@/modules/identity"

export const dynamic = "force-dynamic"

const invalidResponse = () =>
  jsonResponse(400, { ok: false, error: { code: "MAGIC_LINK_INVALID", messageKey: "errors.MAGIC_LINK_INVALID" } })

/**
 * CONTRACT §5.1. POST only: GET never consumes a token, so mail scanners that
 * prefetch links cannot burn it. Unknown, used and expired tokens look identical.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  const parsed = verifyBodySchema.safeParse(await readBody(request))
  if (!parsed.success) return invalidResponse()

  try {
    const result = await verifyMagicLink(parsed.data.token)
    if (!result.ok) return invalidResponse()
    return new Response(null, {
      status: 303,
      headers: {
        location: result.data.next,
        "set-cookie": result.data.setCookie,
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    console.error("[identity] POST /api/auth/magic-link/verify failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "errors.error_generic" } })
  }
}
