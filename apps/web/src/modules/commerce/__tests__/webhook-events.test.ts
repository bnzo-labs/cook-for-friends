import type { Payload } from "payload"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { setStripeForTests } from "../server/stripe-port"
import { setWebhookFaultForTests } from "../webhook/envelope"
import { addHold, guests, holdsOf, makeBookableSession } from "./helpers"
import {
  TEST_WEBHOOK_SECRET,
  chargeRefundedEvent,
  closedEvent,
  completedEvent,
  countJobs,
  enrollmentsOf,
  entitlementsOf,
  invoiceFinalizedEvent,
  ledger,
  makeWebhookFake,
  ordersFor,
  sign,
  stripeRefund,
} from "./webhook-helpers"

const seatReleased = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/modules/scheduling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/scheduling")>()),
  onSeatReleased: seatReleased,
}))

describe.skipIf(!hasTestDb)("W2-07 webhook: refunds, close events, invoices, rollback (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  const fake = makeWebhookFake()
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    payload = await getTestPayload()
    commerce = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterAll(() => {
    setStripeForTests(null)
    setWebhookFaultForTests(null)
  })
  beforeEach(() => seatReleased.mockClear())

  const deliver = (event: object) => {
    const { raw, signature } = sign(event)
    return commerce.handleStripeEvent(raw, signature)
  }
  const outcomeOf = async (event: object) => {
    const r = await deliver(event)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return r.data.outcome
  }
  /** R6 for any event: twice sequentially then twice concurrently; returns the first outcome. */
  const deliverFourTimes = async (event: { id: string }) => {
    const first = await outcomeOf(event)
    expect(await outcomeOf(event)).toBe("skipped")
    expect(await Promise.all([outcomeOf(event), outcomeOf(event)])).toEqual(["skipped", "skipped"])
    expect(await ledger(event.id)).toHaveLength(1)
    return first
  }

  async function paidOrder(quantity: number, invoice: string | null = null) {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity, attendees: guests(quantity - 1) })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity, invoice })
    expect(await outcomeOf(c.event())).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    return { course, session, hold, c, order: order! }
  }

  it("full refund, quantity 3: 3 enrollments refunded, 3 entitlements revoked, onSeatReleased once, refund-issued full (R6 ×4)", async () => {
    const { session, c, order } = await paidOrder(3)
    const refund = stripeRefund(c.pi, c.total)
    const event = chargeRefundedEvent({ pi: c.pi, amount: c.total, refunded: c.total, refunds: [refund] })
    seatReleased.mockClear()
    expect(await deliverFourTimes(event)).toBe("applied")

    const [after] = await ordersFor(payload, c.csId)
    expect(after!.status).toBe("refunded")
    expect(after!.refunds?.map((r) => r.stripeRefundId)).toEqual([refund.id])
    const enrollments = await enrollmentsOf(payload, { order: order.id })
    expect(enrollments.map((e) => e.status)).toEqual(["refunded", "refunded", "refunded"])
    const ents = await entitlementsOf(payload, order.id)
    expect(ents).toHaveLength(3)
    expect(ents.every((e) => e.revokedAt && e.revokedReason === "refund")).toBe(true)
    expect(seatReleased).toHaveBeenCalledTimes(1)
    expect(seatReleased).toHaveBeenCalledWith(session.id)
    expect(await countJobs(`refund-issued-${refund.id}`)).toBe(1)

    // a later event carrying the same refund → dedupe only
    const again = chargeRefundedEvent({ pi: c.pi, amount: c.total, refunded: c.total, refunds: [refund] })
    expect(await outcomeOf(again)).toBe("skipped")
  })

  it("partial refund with metadata.enrollmentId → refunds[].enrollment set, enrollments and entitlements unchanged", async () => {
    const { c, order } = await paidOrder(2)
    const enrollments = await enrollmentsOf(payload, { order: order.id })
    const seat = enrollments[1]!
    const refund = stripeRefund(c.pi, 1000, { orderId: String(order.id), enrollmentId: String(seat.id) })
    expect(await outcomeOf(chargeRefundedEvent({ pi: c.pi, amount: c.total, refunded: 1000, refunds: [refund] }))).toBe("applied")
    const [after] = await ordersFor(payload, c.csId)
    expect(after!.status).toBe("partially_refunded")
    expect(after!.refunds?.[0]?.enrollment).toBe(seat.id)
    expect((await enrollmentsOf(payload, { order: order.id })).every((e) => e.status === "confirmed")).toBe(true)
    expect((await entitlementsOf(payload, order.id)).every((e) => !e.revokedAt)).toBe(true)
    expect(seatReleased).not.toHaveBeenCalled()
    expect(await countJobs(`refund-issued-${refund.id}`)).toBe(1)
  })

  it("oversell order's own charge.refunded → dedupe only, no second email", async () => {
    const { course, session } = await makeBookableSession(payload, 1)
    const holdA = await addHold(payload, session.id, { quantity: 1, expiresAt: new Date(Date.now() - 60_000) })
    const holdB = await addHold(payload, session.id, { quantity: 1 })
    expect(await outcomeOf(completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdB.id }).event())).toBe("applied")
    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id })
    expect(await outcomeOf(a.event())).toBe("refunded")
    const [orderA] = await ordersFor(payload, a.csId)
    const refund = fake.refunds.find((r) => r.key === `oversell-${orderA!.id}`)!.refund
    expect(await outcomeOf(chargeRefundedEvent({ pi: a.pi, amount: a.total, refunded: a.total, refunds: [refund] }))).toBe("skipped")
    expect(await countJobs(`refund-issued-${refund.id}`)).toBe(0)
  })

  it("refundOrder: Stripe refund with metadata + idempotency key; amount > remaining → VALIDATION", async () => {
    const { c, order } = await paidOrder(2)
    const seat = (await enrollmentsOf(payload, { order: order.id }))[1]!
    expect((await commerce.refundOrder({ orderId: order.id, amount: c.total + 1, reason: "test" })).ok).toBe(false)
    const tooMuch = await commerce.refundOrder({ orderId: order.id, amount: c.total + 1, reason: "test" })
    expect(!tooMuch.ok && tooMuch.error.code).toBe("VALIDATION")
    const r = await commerce.refundOrder({ orderId: order.id, amount: 1500, reason: "seat cancel", enrollmentId: seat.id })
    expect(r.ok).toBe(true)
    const created = fake.refunds.at(-1)!
    expect(created.params).toMatchObject({ payment_intent: c.pi, amount: 1500, metadata: { orderId: String(order.id), enrollmentId: String(seat.id) } })
    expect(created.key).toBeTruthy()
    const missing = await commerce.refundOrder({ orderId: 999_999_999, reason: "x" })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
  })

  it("rollback: handler throws after the ledger insert → no ledger row, no order, no job; redelivery succeeds", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id })
    const event = c.event()
    setWebhookFaultForTests(() => {
      throw new Error("injected fault")
    })
    try {
      await expect(deliver(event)).rejects.toThrow("injected fault")
    } finally {
      setWebhookFaultForTests(null)
    }
    expect(await ledger(event.id)).toHaveLength(0)
    expect(await ordersFor(payload, c.csId)).toHaveLength(0)
    expect((await holdsOf(payload, session.id, "active")).map((h) => h.id)).toEqual([hold.id])

    expect(await outcomeOf(event)).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    expect(await countJobs(`order-confirmation-${order!.id}`)).toBe(1)
    expect(await ledger(event.id)).toEqual([{ outcome: "applied" }])
  })

  it("invoice.finalized before completion → 500 (retry); after completion → stored (R6 ×4)", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const invoiceId = `in_test_${uid()}`
    const pdf = `https://pay.stripe.com/invoice/${invoiceId}/pdf`
    const early = invoiceFinalizedEvent({ invoiceId, pdf })
    await expect(deliver(early)).rejects.toThrow(/no matching order/)
    expect(await ledger(early.id)).toHaveLength(0)

    // Completion knows the invoice id; the PDF is not ready yet.
    fake.invoices.set(invoiceId, { id: invoiceId, invoice_pdf: null })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, invoice: invoiceId })
    expect(await outcomeOf(c.event())).toBe("applied")
    expect((await ordersFor(payload, c.csId))[0]!.invoicePdfUrl ?? null).toBeNull()

    expect(await deliverFourTimes(early)).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    expect(order!.stripeInvoiceId).toBe(invoiceId)
    expect(order!.invoicePdfUrl).toBe(pdf)
  })

  it("invoice already finalized at completion → PDF stored from session.invoice", async () => {
    const invoiceId = `in_test_${uid()}`
    fake.invoices.set(invoiceId, { id: invoiceId, invoice_pdf: `https://pay.stripe.com/invoice/${invoiceId}/pdf` })
    const { order } = await paidOrder(1, invoiceId)
    expect(order.stripeInvoiceId).toBe(invoiceId)
    expect(order.invoicePdfUrl).toContain(invoiceId)
  })

  it("invoice.finalized matched by payment intent when the order has no invoice id", async () => {
    const { c } = await paidOrder(1, null)
    const invoiceId = `in_test_${uid()}`
    fake.invoicePayments.set(invoiceId, c.pi)
    expect(await outcomeOf(invoiceFinalizedEvent({ invoiceId, pdf: "https://pay.stripe.com/x.pdf" }))).toBe("applied")
    expect((await ordersFor(payload, c.csId))[0]!.stripeInvoiceId).toBe(invoiceId)
  })

  it("checkout.session.expired → holds released, onSeatReleased once (R6 ×4)", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const csId = `cs_test_${uid()}`
    const hold = await addHold(payload, session.id, { quantity: 2, attendees: guests(1), stripeCheckoutSessionId: csId })
    const event = closedEvent("checkout.session.expired", { csId, courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 2 })
    expect(await deliverFourTimes(event)).toBe("applied")
    expect((await holdsOf(payload, session.id, "released")).map((h) => h.id)).toEqual([hold.id])
    expect(seatReleased).toHaveBeenCalledTimes(1)
    expect(seatReleased).toHaveBeenCalledWith(session.id)
  })

  it("checkout.session.async_payment_failed → holds released, order created cancelled (R6 ×4)", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const csId = `cs_test_${uid()}`
    const hold = await addHold(payload, session.id, { quantity: 1, stripeCheckoutSessionId: csId })
    const event = closedEvent("checkout.session.async_payment_failed", {
      csId,
      courseId: course.id,
      sessionId: session.id,
      holdId: hold.id,
      email: `buyer-${uid()}@example.com`,
    })
    expect(await deliverFourTimes(event)).toBe("applied")
    expect((await holdsOf(payload, session.id, "released")).map((h) => h.id)).toEqual([hold.id])
    const orders = await ordersFor(payload, csId)
    expect(orders).toHaveLength(1)
    expect(orders[0]!.status).toBe("cancelled")
    expect(orders[0]!.number).toMatch(/^CFF-\d{6,}$/)
  })

  it("unknown event type → recorded skipped", async () => {
    const event = { id: `evt_${uid()}`, object: "event", type: "customer.created", created: 0, data: { object: { id: "cus_x" } } }
    expect(await outcomeOf(event)).toBe("skipped")
    expect(await ledger(event.id)).toEqual([{ outcome: "skipped" }])
  })
})
