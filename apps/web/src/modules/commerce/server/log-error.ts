/**
 * W4-03b (W2-11 L-5): log-safe view of a thrown error. Stripe errors can echo
 * request params in `message` (e.g. an invalid `customer_email`), so for them only
 * the machine fields are kept: `type`, `code`, `param` (a field NAME), `statusCode`,
 * `requestId`. Any other error keeps `name` + `message`. Never the raw object
 * (no params, headers, raw bodies or stacks with PII).
 */
export type SafeErrorFields = {
  name?: string
  message?: string
  type?: string
  code?: string
  param?: string
  statusCode?: number
  requestId?: string
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v.slice(0, 200) : undefined)

function isStripeError(e: Record<string, unknown>): boolean {
  const type = str(e.type)
  return Boolean(type && type.startsWith("Stripe")) || str(e.rawType) !== undefined
}

export function safeErrorFields(error: unknown): SafeErrorFields {
  if (!error || typeof error !== "object") return { message: str(String(error)) ?? "unknown error" }
  const e = error as Record<string, unknown>
  if (isStripeError(e)) {
    const out: SafeErrorFields = { type: str(e.type) }
    const code = str(e.code)
    const param = str(e.param)
    const requestId = str(e.requestId)
    if (code) out.code = code
    if (param) out.param = param
    if (typeof e.statusCode === "number") out.statusCode = e.statusCode
    if (requestId) out.requestId = requestId
    return out
  }
  const out: SafeErrorFields = { message: str(e.message) ?? "unknown error" }
  const name = str(e.name)
  const code = str(e.code)
  if (name) out.name = name
  if (code) out.code = code
  return out
}

/** One structured error line: `{ event, level: "error", ...context, error: SafeErrorFields }`. */
export function logError(event: string, error: unknown, context: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ event, level: "error", ...context, error: safeErrorFields(error) }))
}
