import type Stripe from "stripe"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { setStripeForTests } from "../server/stripe-port"
import { prepareCompleted } from "../webhook/handlers/completed-prepare"
import { completedEvent, makeWebhookFake } from "./webhook-helpers"

/** W2-21 (H-1) + M-1: `prepareCompleted` classification, no DB (online course → no hold read). */
vi.mock("@/modules/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/catalog")>()),
  getCourseCommerceRecord: vi.fn(async () => null),
  getSessionView: vi.fn(async () => null),
  getSiteSettings: vi.fn(async () => ({ contactEmail: null })),
}))
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  upsertCustomerByEmail: vi.fn(async ({ email }: { email: string }) => ({ id: 42, email, firstName: "Buyer", lastName: "Person" })),
}))

describe("W2-21 prepareCompleted payment_status", () => {
  const fake = makeWebhookFake()
  beforeAll(() => setStripeForTests(fake.client))
  afterAll(() => setStripeForTests(null))

  const event = (o: { zeroAmount?: boolean; paymentStatus?: string; metadata?: Record<string, string> } = {}) => {
    const e = completedEvent(fake, { courseId: 7, zeroAmount: o.zeroAmount }).event()
    const obj = e.data.object as { payment_status: string; metadata: Record<string, string> }
    if (o.paymentStatus) obj.payment_status = o.paymentStatus
    if (o.metadata) obj.metadata = o.metadata
    return e as unknown as Stripe.Event
  }

  it("no_payment_required (100 % promo) → paid kind, total 0, no PaymentIntent", async () => {
    const p = await prepareCompleted(event({ zeroAmount: true }))
    expect(p.kind).toBe("paid")
    if (p.kind !== "paid") return
    expect(p.paymentIntentId).toBeNull()
    expect(p.session.amount_total).toBe(0)
    expect(p.attendees).toHaveLength(1)
  })

  it("paid → paid kind", async () => {
    expect((await prepareCompleted(event())).kind).toBe("paid")
  })

  it("unpaid → unpaid kind (async methods are off; nothing read)", async () => {
    expect((await prepareCompleted(event({ paymentStatus: "unpaid" }))).kind).toBe("unpaid")
  })

  it("M-1 no cartToken (Payment Link / Dashboard session) → foreign kind, no throw", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    expect((await prepareCompleted(event({ metadata: {} }))).kind).toBe("foreign")
    expect((await prepareCompleted(event({ metadata: { courseId: "1" } }))).kind).toBe("foreign")
    info.mockRestore()
  })

  it("M-1 cartToken present but metadata malformed → still throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(prepareCompleted(event({ metadata: { cartToken: "c", courseId: "x", locale: "fr", quantity: "1" } }))).rejects.toThrow(/metadata/)
    err.mockRestore()
  })
})
