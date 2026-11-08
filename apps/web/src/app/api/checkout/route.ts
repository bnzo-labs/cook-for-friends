import type { Locale } from "@/modules/_shared"
import {
  cartCookieHeader,
  createCheckout,
  getAvailableSeats,
  moduleErrorResponse,
  newCartToken,
  readCartToken,
  type CartLine,
} from "@/modules/commerce"
import { clientIp, consumeRateLimit, forbiddenOrigin, isAllowedOrigin, jsonResponse, readBody } from "@/modules/identity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RATE_LIMIT = { scope: "ip", namespace: "checkout", limit: 10, windowSeconds: 3600 } as const

/**
 * POST /api/checkout — CONTRACT §5.1.
 * Body `{ lines: CartLine[] (exactly 1), locale, email? }` → `{ ok, data: { checkoutUrl, holdExpiresAt } }`.
 * Public (cart-token cookie), Origin check, 10/IP/h. The cart token never comes from the body.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  const existing = readCartToken(request.headers)
  const cartToken = existing ?? newCartToken()
  const cookie: Record<string, string> = existing ? {} : { "set-cookie": cartCookieHeader(cartToken) }

  try {
    const limit = await consumeRateLimit({ ...RATE_LIMIT, key: clientIp(request.headers) })
    if (!limit.allowed) {
      return jsonResponse(
        429,
        { ok: false, error: { code: "RATE_LIMITED", messageKey: "errors.CHECKOUT_RATE_LIMITED" } },
        { ...cookie, "retry-after": String(limit.retryAfterSeconds) },
      )
    }

    const body = await readBody(request)
    const result = await createCheckout({
      cart: body.lines as CartLine[],
      locale: body.locale as Locale,
      customerEmail: body.email as string | undefined,
      cartToken,
    })
    if (result.ok) {
      const { checkoutUrl, holdExpiresAt } = result.data
      return jsonResponse(200, { ok: true, data: { checkoutUrl, holdExpiresAt } }, cookie)
    }

    const details =
      result.error.code === "SOLD_OUT" ? { available: await getAvailableSeats(result.error.sessionId) } : undefined
    const { status, body: envelope } = moduleErrorResponse(result.error, details)
    return jsonResponse(status, envelope, cookie)
  } catch (error) {
    console.error("[commerce] POST /api/checkout failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } }, cookie)
  }
}
