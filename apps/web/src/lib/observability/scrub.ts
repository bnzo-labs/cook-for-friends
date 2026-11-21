/**
 * W4-04 — Sentry event scrubber (Law 25 / no PII).
 * W4-11 — Extended to scrub OTel span/trace URL attributes (D-1) and
 *          parameterise certificate verify path segments (D-2).
 *
 * Pure functions, no SDK import: usable as beforeSend / beforeSendTransaction /
 * beforeBreadcrumb on server, edge and client. Structural typing keeps this file
 * free of `@sentry/nextjs` so it can be unit-tested and bundled anywhere.
 */

export const REDACTED = "[redacted]"

const DROP_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "stripe-signature",
  "mux-signature",
  "x-vercel-protection-bypass",
  "x-forwarded-for",
  "x-real-ip",
])

const DROP_QUERY_PARAMS = new Set(["token", "next", "code", "session_id", "email", "key"])

// Signed-URL query keys (Mux token=, R2/S3 X-Amz-*, generic signature).
const SIGNED_QUERY_RE = /^(x-amz-.*|signature|sig|expires|policy|key-pair-id|jwt)$/i

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Stripe object ids carry no PII but customer/charge refs are noise; keep them. Redact card-like digit runs.
const LONG_DIGITS_RE = /\b\d{13,19}\b/g

const DROP_KEYS = new Set(["metadata", "customer_details", "customer_email", "billing_details", "shipping", "receipt_email"])
const NAME_KEYS = new Set(["name", "first_name", "last_name", "firstname", "lastname", "full_name", "fullname", "display_name", "displayname"])
const EMAIL_KEYS = new Set(["email", "to", "recipient", "from"])

/**
 * Keys whose string value should be treated as a URL (query scrubbing applied).
 * Includes standard keys plus OTel/Sentry span attribute names (D-1 fix).
 */
const URL_VALUE_KEYS = new Set([
  // Standard
  "url", "href", "referer", "referrer",
  // OTel semantic conventions used in Sentry span data / contexts.trace.data
  "http.url", "http.target", "url.full", "url.query", "url.path", "http.query", "http.fragment",
])

/**
 * D-2: Parameterise the certificate verify code in a URL path.
 * Pattern: /<locale>/certificates/verify/<code> → /<locale>/certificates/verify/[code]
 * The code is a public shareable slug, but its presence in Sentry links it to a named
 * recipient, so we replace it with a placeholder.
 */
const CERT_VERIFY_RE = /(\/[^/?#]+\/certificates\/verify\/)([^/?#]+)/

export function scrubString(value: string): string {
  return value.replace(EMAIL_RE, REDACTED).replace(LONG_DIGITS_RE, REDACTED)
}

/** Strip sensitive query params from a URL or relative path; unparsable input is returned with the query dropped. */
export function scrubUrl(input: string): string {
  // D-2: parameterise certificate verify code in path
  const normalised = input.replace(CERT_VERIFY_RE, "$1[code]")
  const qIndex = normalised.indexOf("?")
  if (qIndex === -1) return scrubString(normalised)
  const hashIndex = normalised.indexOf("#", qIndex)
  const base = normalised.slice(0, qIndex)
  const query = normalised.slice(qIndex + 1, hashIndex === -1 ? undefined : hashIndex)
  const kept: string[] = []
  for (const pair of query.split("&")) {
    if (!pair) continue
    const rawKey = pair.split("=")[0] ?? ""
    let key = rawKey
    try {
      key = decodeURIComponent(rawKey)
    } catch {
      /* keep raw */
    }
    const lower = key.toLowerCase()
    if (DROP_QUERY_PARAMS.has(lower) || SIGNED_QUERY_RE.test(lower)) continue
    kept.push(pair)
  }
  return scrubString(kept.length > 0 ? `${base}?${kept.join("&")}` : base)
}

/** Returns true for keys whose string value should have full URL scrubbing applied. */
function isUrlValueKey(lower: string): boolean {
  return URL_VALUE_KEYS.has(lower)
}

function scrubValue(value: unknown, key: string | undefined, depth: number): unknown {
  if (depth > 8) return REDACTED
  const lower = key?.toLowerCase()
  if (lower && DROP_KEYS.has(lower)) return REDACTED
  if (typeof value === "string") {
    if (lower && (NAME_KEYS.has(lower) || EMAIL_KEYS.has(lower))) return REDACTED
    if (lower && isUrlValueKey(lower)) return scrubUrl(value)
    return scrubString(value)
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, key, depth + 1))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValue(v, k, depth + 1)
    return out
  }
  return value
}

function scrubHeaders(headers: unknown): Record<string, unknown> | undefined {
  if (!headers || typeof headers !== "object") return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    const lower = k.toLowerCase()
    if (DROP_HEADERS.has(lower)) continue
    if (lower === "referer" || lower === "referrer" || lower === "origin") {
      if (typeof v === "string") out[k] = scrubUrl(v)
      continue
    }
    out[k] = typeof v === "string" ? scrubString(v) : v
  }
  return out
}

type Loose = Record<string, any>

function scrubRequest(request: Loose): Loose {
  const out: Loose = { ...request }
  delete out.cookies
  delete out.data // request bodies
  delete out.query_string
  if (typeof out.url === "string") out.url = scrubUrl(out.url)
  if (out.headers) out.headers = scrubHeaders(out.headers)
  return out
}

function scrubBreadcrumb(b: Loose): Loose {
  const out: Loose = { ...b }
  if (typeof out.message === "string") out.message = scrubString(out.message)
  if (out.data) {
    const data: Loose = { ...(scrubValue(out.data, undefined, 0) as Loose) }
    for (const k of ["url", "from", "to"]) if (typeof out.data[k] === "string") data[k] = scrubUrl(out.data[k])
    delete data.request_body
    delete data.response_body
    out.data = data
  }
  return out
}

/** Scrub an error/transaction event. Returns a new object; never mutates the input. */
export function scrubEvent<T extends Loose>(event: T): T {
  const out: Loose = { ...event }
  if (out.request) out.request = scrubRequest(out.request)
  if (out.user) out.user = out.user.id ? { id: String(out.user.id) } : undefined
  delete out.server_name
  if (typeof out.message === "string") out.message = scrubString(out.message)
  if (typeof out.transaction === "string") out.transaction = scrubUrl(out.transaction)
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v: Loose) => ({
        ...v,
        value: typeof v.value === "string" ? scrubString(v.value) : v.value,
      })),
    }
  }
  if (Array.isArray(out.breadcrumbs)) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb)
  if (out.extra) out.extra = scrubValue(out.extra, undefined, 0)
  if (out.contexts) out.contexts = scrubValue(out.contexts, undefined, 0)
  if (out.spans) {
    out.spans = out.spans.map((s: Loose) => ({
      ...s,
      description: typeof s.description === "string" ? scrubUrl(s.description) : s.description,
      data: s.data ? scrubValue(s.data, undefined, 0) : s.data,
    }))
  }
  return out as T
}

export function scrubBreadcrumbHook<T extends Loose>(breadcrumb: T): T {
  return scrubBreadcrumb(breadcrumb) as T
}
