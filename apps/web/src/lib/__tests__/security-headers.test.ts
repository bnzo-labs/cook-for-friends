import { describe, expect, it } from "vitest"
import { buildCsp, buildSecurityHeaders, sentryReportUri } from "../security-headers"

const base = { siteUrl: "https://example.com", r2PublicUrl: "https://cdn.example.com/bucket" }
const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value

describe("security headers", () => {
  it("emits the full MASTER §8 set", () => {
    const h = buildSecurityHeaders({ ...base, isProduction: true })
    expect(get(h, "Content-Security-Policy")).toBeTruthy()
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff")
    expect(get(h, "X-Frame-Options")).toBe("DENY")
    expect(get(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    expect(get(h, "Permissions-Policy")).toContain("payment=()")
    expect(get(h, "Cross-Origin-Opener-Policy")).toBe("same-origin")
  })
  it("derives R2 origin only, in img-src and media-src", () => {
    const csp = buildCsp(base)
    expect(csp).toMatch(/img-src [^;]*https:\/\/cdn\.example\.com(?!\/bucket)/)
    expect(csp).not.toContain("/bucket")
    expect(csp).toMatch(/media-src [^;]*https:\/\/cdn\.example\.com/)
  })
  it("allows Gravatar for the Payload admin avatar", () => {
    expect(buildCsp(base)).toMatch(/img-src [^;]*https:\/\/www\.gravatar\.com/)
  })
  it("core directives", () => {
    const csp = buildCsp(base)
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "font-src 'self'",
      "worker-src 'self' blob:",
    ])
      expect(csp).toContain(d)
    expect(csp).toMatch(/connect-src 'self' https:\/\/\*\.mux\.com https:\/\/\*\.litix\.io(;|$)/)
    expect(csp).not.toContain("unsafe-eval")
  })
  it("upgrade-insecure-requests only in production on an https site", () => {
    expect(buildCsp({ ...base, isProduction: true })).toContain("upgrade-insecure-requests")
    expect(buildCsp(base)).not.toContain("upgrade-insecure-requests")
    expect(buildCsp({ isProduction: true, siteUrl: "http://localhost:3000" })).not.toContain(
      "upgrade-insecure-requests",
    )
  })
  it("dev allows eval + ws", () => {
    const csp = buildCsp({ ...base, isDevelopment: true })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("ws:")
  })
  it("mode switch defaults to enforce", () => {
    expect(buildSecurityHeaders(base).map((h) => h.key)).toContain("Content-Security-Policy")
    const ro = buildSecurityHeaders({ ...base, cspMode: "report-only" }).map((h) => h.key)
    expect(ro).toContain("Content-Security-Policy-Report-Only")
    expect(ro).not.toContain("Content-Security-Policy")
    expect(buildSecurityHeaders({ ...base, cspMode: "bogus" }).map((h) => h.key)).toContain(
      "Content-Security-Policy",
    )
  })
  it("HSTS only on https, never includeSubDomains/preload", () => {
    const on = get(buildSecurityHeaders(base), "Strict-Transport-Security")
    expect(on).toBe("max-age=31536000")
    expect(get(buildSecurityHeaders({ siteUrl: "http://localhost:3000" }), "Strict-Transport-Security")).toBeUndefined()
  })
  it("report-uri derived from DSN only when set", () => {
    expect(buildCsp(base)).not.toContain("report-uri")
    const dsn = "https://abc123@o1.ingest.sentry.io/42"
    expect(sentryReportUri(dsn)).toBe("https://o1.ingest.sentry.io/api/42/security/?sentry_key=abc123")
    expect(buildCsp({ ...base, sentryDsn: dsn })).toContain("report-uri https://o1.ingest.sentry.io/api/42/security/")
    expect(sentryReportUri("nope")).toBeNull()
  })
})
