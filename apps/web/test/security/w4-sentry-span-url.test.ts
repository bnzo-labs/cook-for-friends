import { describe, expect, it } from "vitest"

import { scrubEvent } from "@/lib/observability/scrub"

/**
 * W4-03c D-1 (MEDIUM) PoC. `scrubUrl` runs only for keys literally named `url`/`href`/`referer`.
 * Span attributes and `contexts.trace.data` carry the request URL under OTel/Sentry keys
 * (`http.url`, `http.target`, `url.full`, `url.query`, `http.query`), so the magic-link
 * `?token=` (GET /<locale>/auth/verify) and waitlist remove token reach Sentry when a DSN is set.
 * `it.fails` until the scrubber covers these keys; flip to `it` with the fix.
 */
const SECRET = "mlTokenSecret123"
const url = `https://cookforfriends.ca/fr/auth/verify?token=${SECRET}&next=%2Ffr%2Faccount`

const keys = ["http.url", "http.target", "url.full", "url.query", "http.query"] as const

describe("W4-03c D-1: Sentry scrubber vs span URL attributes", () => {
  for (const key of keys) {
    const value = key.endsWith("query") ? `?token=${SECRET}` : key === "http.target" ? `/fr/auth/verify?token=${SECRET}` : url
    it.fails(`span data '${key}' does not leak the token`, () => {
      const out = scrubEvent({ type: "transaction", spans: [{ description: "GET /fr/auth/verify", data: { [key]: value } }] })
      expect(JSON.stringify(out)).not.toContain(SECRET)
    })
    it.fails(`contexts.trace.data '${key}' does not leak the token`, () => {
      const out = scrubEvent({ type: "transaction", contexts: { trace: { data: { [key]: value } } } })
      expect(JSON.stringify(out)).not.toContain(SECRET)
    })
  }

  it("control: request.url is already scrubbed", () => {
    const out = scrubEvent({ request: { url } })
    expect(JSON.stringify(out)).not.toContain(SECRET)
  })
})
