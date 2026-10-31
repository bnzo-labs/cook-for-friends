import { describe, expect, it, vi } from "vitest"

/**
 * Opt-in live smoke against Stripe TEST mode (never runs in CI):
 *   STRIPE_LIVE_SMOKE=1 pnpm vitest run src/modules/commerce/__tests__/live-smoke.test.ts
 * Reads STRIPE_SECRET_KEY from apps/web/.env.local; refuses live keys.
 * Creates a test Product + Price, opens a Checkout session with the real
 * param builder, checks host + expiry window, then expires it and archives
 * the product. The DB half (createCheckout + recordCourseStripeSync) is
 * covered by the integration suites.
 */
describe.skipIf(!process.env.STRIPE_LIVE_SMOKE)("Stripe live smoke (test mode)", () => {
  vi.setConfig({ testTimeout: 60_000 })

  it("checkout session: checkout.stripe.com, expires_at − created ≥ 1800 s, then expired", async () => {
    const { loadEnv } = await import("payload/node")
    const env = process.env as Record<string, string | undefined>
    const nodeEnv = env.NODE_ENV
    env.NODE_ENV = "development"
    try {
      loadEnv()
    } finally {
      env.NODE_ENV = nodeEnv
    }
    expect(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")).toBe(true)

    const { getStripeClient } = await import("@/lib/stripe")
    const { buildSessionParams } = await import("../server/checkout")
    const stripe = getStripeClient()

    const product = await stripe.products.create({ name: "CFF W2-04 smoke", metadata: { smoke: "w2-04" } })
    const price = await stripe.prices.create({ product: product.id, unit_amount: 5000, currency: "cad" })
    try {
      const params = await buildSessionParams({
        course: {
          id: 0,
          format: "in_person",
          status: "published",
          price: 5000,
          title: { fr: "Smoke", en: "Smoke" },
          summary: { fr: "", en: "" },
          slug: { fr: "smoke", en: "smoke" },
          stripeProductId: product.id,
          stripePriceId: price.id,
          stripeSyncStatus: "synced",
        },
        line: { courseId: 0, sessionId: 0, quantity: 2, attendees: [{ firstName: "G", lastName: "T", email: "guest@example.com" }] },
        locale: "fr",
        customerEmail: "buyer@example.com",
        cartToken: "smoke-cart-token-000000",
        holdId: 0,
        now: new Date(),
      })
      const session = await stripe.checkout.sessions.create(params)
      expect(new URL(session.url as string).host).toBe("checkout.stripe.com")
      const got = await stripe.checkout.sessions.retrieve(session.id)
      expect(got.expires_at - got.created).toBeGreaterThanOrEqual(1800)
      expect(got.metadata).toMatchObject({ quantity: "2", locale: "fr" })
      const expired = await stripe.checkout.sessions.expire(session.id)
      expect(expired.status).toBe("expired")
      console.info("[smoke] checkout session", session.id, "window", got.expires_at - got.created, "s")
    } finally {
      await stripe.products.update(product.id, { active: false })
    }
  })
})
