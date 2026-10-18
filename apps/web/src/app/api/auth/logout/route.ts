import { defaultLocale } from "@/i18n/locales"
import { endCustomerSession, forbiddenOrigin, isAllowedOrigin, jsonResponse } from "@/modules/identity"

export const dynamic = "force-dynamic"

/** CONTRACT §5.1: clear the customer cookie, `303 /{locale}`. */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return forbiddenOrigin()

  try {
    const { customer, clearCookie } = await endCustomerSession(request.headers)
    const headers = new Headers({
      location: `/${customer?.preferredLocale ?? defaultLocale}`,
      "cache-control": "no-store",
    })
    if (clearCookie) headers.set("set-cookie", clearCookie)
    return new Response(null, { status: 303, headers })
  } catch (error) {
    console.error("[identity] POST /api/auth/logout failed", error)
    return jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "errors.error_generic" } })
  }
}
