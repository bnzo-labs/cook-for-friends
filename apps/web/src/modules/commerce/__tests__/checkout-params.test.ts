import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { buildSessionParams, cartTokenRef, CHECKOUT_TTL_SECONDS } from "../server/checkout"
import { isAppObject, parseCheckoutMetadata } from "../webhook/shared"

const course = {
  id: 42,
  format: "in_person" as const,
  status: "published" as const,
  price: 5000,
  title: { fr: "Pâtes", en: "Pasta" },
  summary: { fr: "", en: "" },
  slug: { fr: "pates", en: "pasta" },
  stripeProductId: "prod_x",
  stripePriceId: "price_x",
  stripeSyncStatus: "synced" as const,
}
const now = new Date("2026-11-01T12:00:00.000Z")

describe("buildSessionParams", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example.com/"
    delete process.env.STRIPE_TAX_ENABLED
  })
  afterEach(() => {
    process.env = { ...env }
  })

  const build = (over: Partial<Parameters<typeof buildSessionParams>[0]> = {}) =>
    buildSessionParams({
      course,
      line: {
        courseId: 42,
        sessionId: 7,
        quantity: 3,
        attendees: [
          { firstName: "Ann", lastName: "Lee", email: "ann@example.com" },
          { firstName: "Bo", lastName: "Ray", email: "bo@example.com" },
        ],
      },
      locale: "fr",
      customerEmail: "buyer@example.com",
      cartToken: "cart-token-abcdefghijkl",
      holdId: 99,
      now,
      ...over,
    })

  it("one line with quantity N, card only, invoice, promo codes, 31-min expiry", async () => {
    const p = await build()
    expect(p.mode).toBe("payment")
    expect(p.line_items).toEqual([{ price: "price_x", quantity: 3 }])
    expect(p.line_items?.[0]).not.toHaveProperty("adjustable_quantity")
    expect(p.payment_method_types).toEqual(["card"])
    expect(p.allow_promotion_codes).toBe(true)
    expect(p.invoice_creation?.enabled).toBe(true)
    expect(p.expires_at).toBe(Math.floor(now.getTime() / 1000) + CHECKOUT_TTL_SECONDS)
    expect((p.expires_at as number) - now.getTime() / 1000).toBeGreaterThanOrEqual(1800)
    expect(p.customer_email).toBe("buyer@example.com")
    expect(p.locale).toBe("fr-CA")
    expect(p).not.toHaveProperty("automatic_tax")
  })

  it("metadata on session, PaymentIntent and invoice; no guest PII anywhere", async () => {
    const p = await build()
    const metadata = {
      cartToken: cartTokenRef("cart-token-abcdefghijkl"),
      holdId: "99",
      courseId: "42",
      sessionId: "7",
      locale: "fr",
      quantity: "3",
    }
    expect(p.metadata).toEqual(metadata)
    expect(p.payment_intent_data?.metadata).toEqual(metadata)
    expect(p.invoice_creation?.invoice_data?.metadata).toEqual(metadata)
    const json = JSON.stringify(p)
    for (const pii of ["ann@example.com", "bo@example.com", "Ann", "Lee", "Ray"]) expect(json).not.toContain(pii)
    // W4-03b (W2-11 L-7): the cart cookie secret never reaches Stripe
    expect(json).not.toContain("cart-token-abcdefghijkl")
    expect(metadata.cartToken).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it("translated success/cancel URLs per locale", async () => {
    const fr = await build()
    expect(fr.success_url).toBe("https://shop.example.com/fr/commande/merci?session_id={CHECKOUT_SESSION_ID}")
    expect(fr.cancel_url).toBe("https://shop.example.com/fr/commande/annulee")
    const en = await build({ locale: "en" })
    expect(en.success_url).toBe("https://shop.example.com/en/checkout/success?session_id={CHECKOUT_SESSION_ID}")
    expect(en.cancel_url).toBe("https://shop.example.com/en/checkout/cancelled")
    expect(en.locale).toBe("en")
    expect(en.metadata?.locale).toBe("en")
  })

  it("online: no holdId/sessionId keys; no customer_email when absent", async () => {
    const p = await build({ holdId: null, line: { courseId: 42, quantity: 1 }, customerEmail: undefined })
    expect(p.metadata).toEqual({ cartToken: cartTokenRef("cart-token-abcdefghijkl"), courseId: "42", locale: "fr", quantity: "1" })
    expect(p).not.toHaveProperty("customer_email")
  })

  it("D6: automatic_tax only when STRIPE_TAX_ENABLED=true", async () => {
    process.env.STRIPE_TAX_ENABLED = "true"
    expect((await build()).automatic_tax).toEqual({ enabled: true })
    process.env.STRIPE_TAX_ENABLED = "false"
    expect(await build()).not.toHaveProperty("automatic_tax")
  })

  it("missing NEXT_PUBLIC_SITE_URL is a configuration error", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    await expect(build()).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/)
  })
})

describe("W2-11 L-7 cart token ref in Stripe metadata", () => {
  const base = { courseId: "42", locale: "fr", quantity: "1" }
  it("hashed ref and legacy raw token (sessions created before deploy) both resolve as ours", () => {
    for (const cartToken of [cartTokenRef("cart-token-abcdefghijkl"), "cart-token-abcdefghijkl"]) {
      expect(isAppObject({ ...base, cartToken })).toBe(true)
      expect(parseCheckoutMetadata({ ...base, cartToken }, "test").courseId).toBe(42)
    }
  })
  it("ref is deterministic and never contains the cookie value", () => {
    expect(cartTokenRef("a")).toBe(cartTokenRef("a"))
    expect(cartTokenRef("a")).not.toBe(cartTokenRef("b"))
    expect(cartTokenRef("cart-token-abcdefghijkl")).not.toContain("cart-token")
  })
})
