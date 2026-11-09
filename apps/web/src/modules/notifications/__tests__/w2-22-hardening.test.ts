/**
 * W2-22: notifications hardening (W2-11 M-2, M-3) + zero-amount oversell copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendEmail } from "../server/send"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"
import { MAX_DISPLAY_NAME_LENGTH, sanitizeDisplayName } from "../templates/sanitize"

const guestData = (buyerName: string) => ({
  buyerName,
  courseTitle: "Sushi Making",
  sessionStartsAt: "2026-09-01T18:00:00-04:00",
  sessionEndsAt: "2026-09-01T20:00:00-04:00",
  location: { name: "Studio", address: "10 King St", city: "Toronto" },
})

describe("M-2: no recipient PII in logs", () => {
  afterEach(() => {
    setEmailTransportForTests(null)
    vi.restoreAllMocks()
  })

  it("transport failure log omits recipient", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    setEmailTransportForTests(async () => {
      throw new Error("boom")
    })
    const to = "secret.person@example.com"
    const res = await sendEmail({
      template: "enrollment-confirmation",
      to,
      locale: "en",
      data: guestData("Alice"),
      idempotencyKey: "idem-1",
    })
    expect(res.ok).toBe(false)
    expect(spy).toHaveBeenCalled()
    const logged = JSON.stringify(spy.mock.calls.map((c) => c.map((a) => (a instanceof Error ? a.message : a))))
    expect(logged).not.toContain(to)
    expect(logged).not.toContain("secret.person")
    expect(logged).toContain("idem-1")
  })
})

describe("M-3: guest subject has no buyer name", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]
  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })
  afterEach(() => setEmailTransportForTests(null))

  it.each(["en", "fr"] as const)("%s: subject/preview omit name; body sanitized", async (locale) => {
    const evil = "FREE CRYPTO http://evil.test\r\nBcc: x@y.z" + "A".repeat(200)
    await sendEmail({
      template: "enrollment-confirmation",
      to: "g@example.com",
      locale,
      data: guestData(evil),
      idempotencyKey: `ec-${locale}`,
    })
    const email = captured[0]!
    expect(email.subject).toContain("Sushi Making")
    expect(email.subject).not.toContain("CRYPTO")
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.html).toContain("FREE CRYPTO")
    expect(email.html).not.toContain("A".repeat(MAX_DISPLAY_NAME_LENGTH + 5))
    expect(email.html).not.toContain("\r")
  })

  it("escapes HTML in name", async () => {
    await sendEmail({
      template: "enrollment-confirmation",
      to: "g@example.com",
      locale: "en",
      data: guestData("<script>alert(1)</script>"),
      idempotencyKey: "ec-xss",
    })
    expect(captured[0]!.html).not.toContain("<script>alert")
  })
})

describe("sanitizeDisplayName", () => {
  it("strips controls/bidi, collapses whitespace, caps length", () => {
    expect(sanitizeDisplayName("a\u0000b‮c\n\td")).toBe("a b c d")
    expect(Array.from(sanitizeDisplayName("x".repeat(500))).length).toBe(MAX_DISPLAY_NAME_LENGTH + 1)
    expect(sanitizeDisplayName("  Jean  ")).toBe("Jean")
  })
})

describe("oversell-refund zero amount", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]
  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })
  afterEach(() => setEmailTransportForTests(null))

  const send = (locale: "en" | "fr", refundAmount: number) =>
    sendEmail({
      template: "oversell-refund",
      to: "b@example.com",
      locale,
      data: { orderNumber: "ORD-1", courseTitle: "Sushi Making", sessionStartsAt: "2026-09-01T18:00:00-04:00", quantity: 2, refundAmount, currency: "cad" },
      idempotencyKey: `os-${locale}-${refundAmount}`,
    })

  it.each([
    ["en", /not charged/i, /refund/i],
    ["fr", /Aucun montant/, /rembours/i],
  ] as const)("%s: 0 renders not-charged copy, no refund amount", async (locale, yes, no) => {
    expect((await send(locale, 0)).ok).toBe(true)
    const e = captured[0]!
    expect(e.html + e.text).toMatch(yes)
    expect(e.html + e.text + e.subject).not.toMatch(no)
    expect(e.html + e.text).not.toMatch(/0[.,]00/)
  })

  it.each([
    ["en", /Amount refunded/],
    ["fr", /Montant remboursé/],
  ] as const)("%s: non-zero keeps refund copy", async (locale, yes) => {
    expect((await send(locale, 4500)).ok).toBe(true)
    const e = captured[0]!
    expect(e.html).toMatch(yes)
    expect(e.text).toMatch(yes)
    expect(e.html).toMatch(/45[.,]00/)
  })
})
