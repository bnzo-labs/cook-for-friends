import { readCartToken, releaseCartHolds } from "@/modules/commerce"
import { forbiddenOrigin, isAllowedOrigin, jsonResponse } from "@/modules/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/checkout/release — CCR-W2-4. Releases the cart's active holds and
 * expires their open Checkout sessions. No (valid) cookie → `{ released: 0 }`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  const cartToken = readCartToken(request.headers)
  if (!cartToken) return jsonResponse(200, { ok: true, data: { released: 0 } })

  try {
    const { released } = await releaseCartHolds(cartToken)
    return jsonResponse(200, { ok: true, data: { released } })
  } catch (error) {
    console.error("[commerce] POST /api/checkout/release failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
