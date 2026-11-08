/**
 * Unit tests for sendEmail() — CONTRACT §4 surface.
 *
 * Validates:
 * - Returns VALIDATION error for Wave 3 (non-Wave-2) templates
 * - Returns ok:true for valid Wave 2 templates (via test transport)
 * - Dispatches correct template renderer (subject line contains expected text)
 * - XSS: user-supplied data is NOT interpreted as HTML in plain-text output
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sendEmail } from "../server/send"
import { buildTestTransport, setEmailTransportForTests } from "../server/transport"

describe("sendEmail — validation guard", () => {
  afterEach(() => setEmailTransportForTests(null))

  it("returns VALIDATION error for a Wave-3 template (reminder)", async () => {
    const { transport } = buildTestTransport()
    setEmailTransportForTests(transport)

    const result = await sendEmail({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template: "reminder" as any,
      to: "test@example.com",
      locale: "en",
      data: {} as never,
      idempotencyKey: "test-key",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION")
    }
  })

  it("returns VALIDATION error for certificate-issued (Wave-3)", async () => {
    const { transport } = buildTestTransport()
    setEmailTransportForTests(transport)

    const result = await sendEmail({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template: "certificate-issued" as any,
      to: "test@example.com",
      locale: "en",
      data: {} as never,
      idempotencyKey: "test-key",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION")
    }
  })
})

describe("sendEmail — magic-link template", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]

  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })

  afterEach(() => setEmailTransportForTests(null))

  it("returns ok:true and captures one email", async () => {
    const result = await sendEmail({
      template: "magic-link",
      to: "user@example.com",
      locale: "en",
      data: { link: "https://cookforfriends.ca/auth/verify?token=abc123", expiresInMinutes: 15 },
      idempotencyKey: "ml-test-001",
    })

    expect(result.ok).toBe(true)
    expect(captured).toHaveLength(1)
  })

  it("captured email has to, html, text, subject", async () => {
    await sendEmail({
      template: "magic-link",
      to: "user@example.com",
      locale: "fr",
      data: { link: "https://cookforfriends.ca/auth/verify?token=abc123", expiresInMinutes: 15 },
      idempotencyKey: "ml-test-fr-001",
    })

    const email = captured[0]!
    expect(email.to).toBe("user@example.com")
    expect(email.subject).toBeTruthy()
    expect(email.html).toContain("<")
    expect(email.text).toBeTruthy()
    // text should NOT contain HTML tags
    expect(email.text).not.toMatch(/<[a-z]/)
  })

  it("XSS: malicious link is NOT interpreted as executable in plain text", async () => {
    const xssLink = 'https://evil.com?x="><script>alert(1)</script>'
    await sendEmail({
      template: "magic-link",
      to: "user@example.com",
      locale: "en",
      data: { link: xssLink, expiresInMinutes: 15 },
      idempotencyKey: "ml-xss-test",
    })

    const email = captured[0]!
    // HTML should not have unescaped script tags in button href context
    // The react-email render escapes attributes
    expect(email.html).not.toContain("<script>alert(1)</script>")
  })
})

describe("sendEmail — order-confirmation template", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]

  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })

  afterEach(() => setEmailTransportForTests(null))

  it("renders order-confirmation with qty 3 + 2 attendees in French", async () => {
    const result = await sendEmail({
      template: "order-confirmation",
      to: "acheteur@example.com",
      locale: "fr",
      data: {
        orderNumber: "ORD-2026-001",
        customerFirstName: "Marie",
        currency: "cad" as const,
        items: [
          {
            title: "Cuisine méditerranéenne",
            quantity: 3,
            amount: 22500, // 225.00 CAD
            sessionStartsAt: "2026-07-10T18:00:00-04:00",
            sessionEndsAt: "2026-07-10T21:00:00-04:00",
            location: {
              name: "Studio Culinaire",
              address: "100 rue King",
              city: "Toronto",
              postalCode: "M5V 1A1",
              mapsUrl: "https://maps.google.com/?q=...",
            },
            attendees: [
              { name: "Pierre Tremblay", email: "pierre@example.com" },
              { name: "Anne Dupont", email: "anne@example.com" },
            ],
          },
        ],
        subtotal: 22500,
        discountTotal: 0,
        taxTotal: 2925,
        total: 25425,
      },
      idempotencyKey: "oc-fr-test-001",
    })

    expect(result.ok).toBe(true)
    const email = captured[0]!
    expect(email.subject).toContain("ORD-2026-001")
    expect(email.html).toContain("Marie")
    expect(email.html).toContain("Cuisine méditerranéenne")
    expect(email.html).toContain("Pierre Tremblay")
    expect(email.html).toContain("Anne Dupont")
  })

  it("renders order-confirmation in English without attendees", async () => {
    const result = await sendEmail({
      template: "order-confirmation",
      to: "buyer@example.com",
      locale: "en",
      data: {
        orderNumber: "ORD-2026-002",
        currency: "cad" as const,
        items: [
          {
            title: "Italian Cooking",
            quantity: 1,
            amount: 7500,
            sessionStartsAt: "2026-08-05T19:00:00-04:00",
            sessionEndsAt: "2026-08-05T21:30:00-04:00",
            location: {
              name: "The Kitchen Studio",
              address: "50 Queen St W",
              city: "Toronto",
              postalCode: "M5H 2M4",
            },
          },
        ],
        subtotal: 7500,
        discountTotal: 0,
        taxTotal: 975,
        total: 8475,
      },
      idempotencyKey: "oc-en-test-001",
    })

    expect(result.ok).toBe(true)
    const email = captured[0]!
    expect(email.html).toContain("Italian Cooking")
    expect(email.html).not.toContain("Seats booked for")
  })
})

describe("sendEmail — enrollment-confirmation template", () => {
  let captured: ReturnType<typeof buildTestTransport>["captured"]

  beforeEach(() => {
    const tb = buildTestTransport()
    captured = tb.captured
    setEmailTransportForTests(tb.transport)
  })

  afterEach(() => setEmailTransportForTests(null))

  it("does NOT include price/currency/order-number in enrollment-confirmation FR", async () => {
    await sendEmail({
      template: "enrollment-confirmation",
      to: "guest@example.com",
      locale: "fr",
      data: {
        buyerName: "Jean Tremblay",
        courseTitle: "Cours de pâtisserie",
        sessionStartsAt: "2026-07-15T14:00:00-04:00",
        sessionEndsAt: "2026-07-15T17:00:00-04:00",
        location: {
          name: "Atelier Pâtisserie",
          address: "200 Rue Sherbrooke",
          city: "Toronto",
          postalCode: "M4X 1A5",
          mapsUrl: "https://maps.google.com/?q=...",
        },
      },
      idempotencyKey: "ec-fr-test-001",
    })

    const email = captured[0]!
    expect(email.html).toContain("Jean Tremblay")
    expect(email.html).toContain("Cours de pâtisserie")
    // No financial info
    expect(email.html).not.toMatch(/\$\d/)
    expect(email.html).not.toContain("CAD")
    expect(email.html).not.toContain("Total")
    expect(email.html).not.toContain("ORD-")
  })

  it("renders enrollment-confirmation in English without mapsUrl", async () => {
    const result = await sendEmail({
      template: "enrollment-confirmation",
      to: "guest@example.com",
      locale: "en",
      data: {
        buyerName: "Alice Smith",
        courseTitle: "Sushi Making",
        sessionStartsAt: "2026-09-01T18:00:00-04:00",
        sessionEndsAt: "2026-09-01T20:00:00-04:00",
        location: {
          name: "Cooking Studio",
          address: "10 King St",
          city: "Toronto",
        },
      },
      idempotencyKey: "ec-en-test-001",
    })

    expect(result.ok).toBe(true)
    const email = captured[0]!
    expect(email.html).toContain("Alice Smith")
    expect(email.html).toContain("Sushi Making")
  })
})
