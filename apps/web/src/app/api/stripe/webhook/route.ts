import { handleStripeEvent, moduleErrorResponse } from "@/modules/commerce"
import { jsonResponse } from "@/modules/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const serverError = () =>
  jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })

/**
 * POST /api/stripe/webhook — CONTRACT §5.1 / §6. Raw body + Stripe signature.
 * 200 `{ ok, data: { outcome } }` (also on duplicate: `skipped`); bad signature → 400;
 * missing secret or handler error → 500 so Stripe retries.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature")
  const rawBody = await request.text()
  if (!signature) {
    const { status, body } = moduleErrorResponse({ code: "VALIDATION", issues: [{ path: "stripe-signature", message: "SIGNATURE_MISSING" }] })
    return jsonResponse(status, body)
  }
  try {
    const result = await handleStripeEvent(rawBody, signature)
    if (!result.ok) {
      const { status, body } = moduleErrorResponse(result.error)
      return jsonResponse(status, body)
    }
    return jsonResponse(200, { ok: true, data: { outcome: result.data.outcome } })
  } catch (error) {
    console.error("[commerce] POST /api/stripe/webhook failed", error)
    return serverError()
  }
}
