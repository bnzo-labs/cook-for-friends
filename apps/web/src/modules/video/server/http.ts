import type { ModuleError } from "@/modules/_shared"
import { isAllowedOrigin, jsonResponse, forbiddenOrigin } from "@/modules/identity"
import type { CustomerView } from "@/modules/identity"

export { forbiddenOrigin, isAllowedOrigin, jsonResponse }

type Envelope = { ok: false; error: { code: string; messageKey: string } }

const STATUS: Record<ModuleError["code"], number> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  HOLD_EXPIRED: 409,
  CONFLICT: 409,
  UPSTREAM: 502,
}

/** `ModuleError` → status + localized-key envelope. Upstream detail is never returned. */
export function videoErrorResponse(error: ModuleError): Response {
  // Video disabled / unconfigured: 503, not a gateway error.
  const status = error.code === "UPSTREAM" && error.message === "not_configured" ? 503 : STATUS[error.code]
  const body: Envelope = { ok: false, error: { code: error.code, messageKey: `errors.${error.code}` } }
  return jsonResponse(status, body)
}

export const unauthenticated = (): Response =>
  jsonResponse(401, { ok: false, error: { code: "FORBIDDEN", messageKey: "errors.FORBIDDEN" } })

export const rateLimited = (retryAfterSeconds: number): Response =>
  jsonResponse(
    429,
    { ok: false, error: { code: "RATE_LIMITED", messageKey: "errors.RATE_LIMITED" } },
    { "retry-after": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  )

export const serverError = (): Response =>
  jsonResponse(500, { ok: false, error: { code: "UPSTREAM", messageKey: "common.error_generic" } })

export type Actor =
  | { kind: "customer"; customer: CustomerView }
  | { kind: "staff"; id: string }
  | { kind: "anonymous" }

/** Resolve the caller from the session cookie: customer, staff (users) or anonymous. */
export async function resolveActor(headers: Headers): Promise<Actor> {
  const { getPayload } = await import("@/lib/payload")
  const { isStaff, getCurrentCustomer } = await import("@/modules/identity")
  const payload = await getPayload()
  const { user } = await payload.auth({ headers })
  if (user && isStaff(user)) return { kind: "staff", id: String(user.id) }
  const customer = await getCurrentCustomer(headers)
  return customer ? { kind: "customer", customer } : { kind: "anonymous" }
}
