/**
 * W4-03a — MASTER §8 security headers. Pure: no process.env access, no imports,
 * so next.config.ts can use it at build time (env.ts validation not loaded there).
 *
 * CSP mode: static header, script-src 'unsafe-inline' (Next App Router inline flight
 * scripts). A nonce would force every page dynamic and kill ISR (Lighthouse NFR).
 */

export type CspMode = "enforce" | "report-only"

export interface SecurityHeaderEnv {
  /** NEXT_PUBLIC_SITE_URL — HSTS only when https. */
  siteUrl?: string
  /** R2_PUBLIC_URL — origin added to img-src. */
  r2PublicUrl?: string
  /** SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN — report-uri derived only when set. */
  sentryDsn?: string
  /** CSP_MODE, default enforce. */
  cspMode?: string
  /** Production build: adds upgrade-insecure-requests. */
  isProduction?: boolean
  /** Dev needs 'unsafe-eval' (React refresh) and ws: for HMR. */
  isDevelopment?: boolean
}

export interface HeaderEntry {
  key: string
  value: string
}

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** https://<key>@o123.ingest.sentry.io/<id> → https://o123.ingest.sentry.io/api/<id>/security/?sentry_key=<key> */
export function sentryReportUri(dsn: string | undefined): string | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.split("/").filter(Boolean).pop()
    if (!u.username || !projectId) return null
    return `${u.protocol}//${u.host}/api/${projectId}/security/?sentry_key=${u.username}`
  } catch {
    return null
  }
}

export function resolveCspMode(raw: string | undefined): CspMode {
  return raw === "report-only" ? "report-only" : "enforce"
}

export function buildCsp(env: SecurityHeaderEnv): string {
  const r2 = originOf(env.r2PublicUrl)
  const report = sentryReportUri(env.sentryDsn)
  const dev = env.isDevelopment === true

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https://image.mux.com", ...(r2 ? [r2] : [])]],
    ["media-src", ["'self'", "blob:", "https://*.mux.com", ...(r2 ? [r2] : [])]],
    ["font-src", ["'self'"]],
    [
      "connect-src",
      ["'self'", "https://*.mux.com", "https://*.litix.io", ...(dev ? ["ws:", "wss:"] : [])],
    ],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'", "https://checkout.stripe.com"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
  ]

  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`)
  if (env.isProduction) parts.push("upgrade-insecure-requests")
  if (report) parts.push(`report-uri ${report}`)
  return parts.join("; ")
}

export function buildSecurityHeaders(env: SecurityHeaderEnv): HeaderEntry[] {
  const mode = resolveCspMode(env.cspMode)
  const headers: HeaderEntry[] = [
    {
      key: mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      value: buildCsp(env),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ]
  // D8 undecided (domain shared with Shopify): no includeSubDomains / preload.
  if (env.siteUrl?.startsWith("https://")) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" })
  }
  return headers
}
