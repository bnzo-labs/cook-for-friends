import { describe, expect, it } from "vitest"

import { scrubEvent, scrubUrl } from "@/lib/observability/scrub"

/**
 * W4-03c D-1 (MEDIUM) + D-2 (LOW).
 *
 * D-1: Span attributes and `contexts.trace.data` carry the request URL under OTel/Sentry keys
 * (`http.url`, `http.target`, `url.full`, `url.query`, `url.path`, `http.query`, `http.fragment`),
 * so magic-link `?token=` and waitlist remove token would reach Sentry with a DSN set.
 * Fixed in W4-11: `scrubValue` now routes all URL_VALUE_KEYS through `scrubUrl`.
 *
 * D-2: Certificate verify code in URL path/transaction name.
 * Fixed in W4-11: `scrubUrl` parameterises /<locale>/certificates/verify/<code> → [code].
 */
const SECRET = "mlTokenSecret123"
const url = `https://cookforfriends.ca/fr/auth/verify?token=${SECRET}&next=%2Ffr%2Faccount`

// All OTel span keys that must be scrubbed (D-1)
const keys = ["http.url", "http.target", "url.full", "url.query", "url.path", "http.query", "http.fragment"] as const

describe("W4-03c D-1: Sentry scrubber vs span URL attributes", () => {
  for (const key of keys) {
    const value =
      key === "http.target" ? `/fr/auth/verify?token=${SECRET}` :
      key === "url.path" ? `/fr/auth/verify` :
      key.endsWith("query") || key.endsWith("fragment") ? `?token=${SECRET}` :
      url

    it(`span data '${key}' does not leak the token`, () => {
      const out = scrubEvent({ type: "transaction", spans: [{ description: "GET /fr/auth/verify", data: { [key]: value } }] })
      expect(JSON.stringify(out)).not.toContain(SECRET)
    })

    it(`contexts.trace.data '${key}' does not leak the token`, () => {
      const out = scrubEvent({ type: "transaction", contexts: { trace: { data: { [key]: value } } } })
      expect(JSON.stringify(out)).not.toContain(SECRET)
    })
  }

  it("control: request.url is already scrubbed", () => {
    const out = scrubEvent({ request: { url } })
    expect(JSON.stringify(out)).not.toContain(SECRET)
  })

  it("waitlist remove token is stripped from span http.url", () => {
    const removeUrl = `https://cookforfriends.ca/fr/waitlist/remove?token=${SECRET}`
    const out = scrubEvent({
      type: "transaction",
      spans: [{ description: "GET /fr/waitlist/remove", data: { "http.url": removeUrl } }],
    })
    expect(JSON.stringify(out)).not.toContain(SECRET)
  })

  it("non-sensitive query params survive scrubbing", () => {
    const safeUrl = `https://cookforfriends.ca/fr/catalog?page=2&lang=fr`
    const out = scrubEvent({
      type: "transaction",
      spans: [{ description: "GET /fr/catalog", data: { "http.url": safeUrl } }],
    })
    expect(JSON.stringify(out)).toContain("page=2")
  })
})

describe("W4-03c D-2: certificate verify code parameterisation", () => {
  const certCode = "CERT-ABC-XYZ-9999"
  const certPath = `/fr/certificates/verify/${certCode}`
  const certUrl = `https://cookforfriends.ca${certPath}`

  it("scrubUrl replaces cert code in relative path", () => {
    expect(scrubUrl(certPath)).toBe("/fr/certificates/verify/[code]")
  })

  it("scrubUrl replaces cert code in full URL", () => {
    expect(scrubUrl(certUrl)).toBe("https://cookforfriends.ca/fr/certificates/verify/[code]")
  })

  it("cert code is not visible in transaction name", () => {
    const out = scrubEvent({ type: "transaction", transaction: `GET ${certUrl}` })
    expect(JSON.stringify(out)).not.toContain(certCode)
  })

  it("cert code is not visible in request.url", () => {
    const out = scrubEvent({ type: "transaction", request: { url: certUrl } })
    expect(JSON.stringify(out)).not.toContain(certCode)
  })

  it("cert code is not visible in span http.url (D-1 + D-2 combined)", () => {
    const out = scrubEvent({
      type: "transaction",
      spans: [{ description: "render cert page", data: { "http.url": certUrl } }],
    })
    expect(JSON.stringify(out)).not.toContain(certCode)
  })

  it("cert code is not visible in contexts.trace.data http.target (D-1 + D-2)", () => {
    const out = scrubEvent({
      type: "transaction",
      contexts: { trace: { data: { "http.target": certPath } } },
    })
    expect(JSON.stringify(out)).not.toContain(certCode)
  })

  it("non-cert paths are not modified", () => {
    expect(scrubUrl("/fr/catalog/my-course")).toBe("/fr/catalog/my-course")
    expect(scrubUrl("/fr/certificates/my-cert")).toBe("/fr/certificates/my-cert")
  })
})
