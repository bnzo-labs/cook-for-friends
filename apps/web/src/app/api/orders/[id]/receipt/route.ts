import { getOrderReceiptUrl, moduleErrorResponse } from "@/modules/commerce"
import { jsonResponse } from "@/modules/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/orders/:id/receipt — CONTRACT §5.1. Owner customer or staff → 302 to
 * the Stripe invoice PDF. Anonymous / unknown / no invoice → 404; other customer → 403.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await ctx.params
    const result = await getOrderReceiptUrl(id, request.headers)
    if (result.ok) {
      return new Response(null, { status: 302, headers: { location: result.data.url, "cache-control": "private, no-store" } })
    }
    const { status, body } = moduleErrorResponse(result.error)
    return jsonResponse(status, body)
  } catch (error) {
    console.error("[commerce] GET /api/orders/:id/receipt failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })
  }
}
