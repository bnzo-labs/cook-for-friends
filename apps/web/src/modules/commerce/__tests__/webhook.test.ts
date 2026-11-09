import type { Payload } from "payload"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { makeCustomer } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { setStripeForTests } from "../server/stripe-port"
import { addHold, guests, holdsOf, makeBookableSession, makePurchasableCourse } from "./helpers"
import {
  TEST_WEBHOOK_SECRET,
  completedEvent,
  countJobs,
  enrollmentsOf,
  entitlementsOf,
  jobsLike,
  ledger,
  makeWebhookFake,
  ordersFor,
  sign,
} from "./webhook-helpers"

const seatReleased = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/modules/scheduling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/scheduling")>()),
  onSeatReleased: seatReleased,
}))

/**
 * R6 (DISCOVERY §7) + oversell: real Postgres, signed payloads, fake Stripe
 * through the W2-04 port.
 */
describe.skipIf(!hasTestDb)("W2-07 webhook: checkout.session.completed (integration)", () => {
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
  afterAll(() => setStripeForTests(null))
  beforeEach(() => seatReleased.mockClear())

  const deliver = async (event: object) => {
    const { raw, signature } = sign(event)
    return commerce.handleStripeEvent(raw, signature)
  }
  const outcomeOf = async (event: object) => {
    const r = await deliver(event)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return r.data.outcome
  }

  it("R6 single seat: twice sequentially + twice concurrently → 1 order, 1 enrollment, 1 entitlement, 1 job, 1 ledger row", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id })
    const event = c.event()

    expect(await outcomeOf(event)).toBe("applied")
    expect(await outcomeOf(event)).toBe("skipped")
    const concurrent = await Promise.all([outcomeOf(event), outcomeOf(event)])
    expect(concurrent).toEqual(["skipped", "skipped"])

    // a second, distinct event id for the same Checkout session (async_payment_succeeded) is also a no-op
    expect(await outcomeOf({ ...event, id: `evt_${uid()}`, type: "checkout.session.async_payment_succeeded" })).toBe("skipped")

    const orders = await ordersFor(payload, c.csId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.status).toBe("paid")
    expect(order.number).toBe(`CFF-${String(order.id).padStart(6, "0")}`)
    expect(order.items?.[0]?.quantity).toBe(1)
    expect(await enrollmentsOf(payload, { order: order.id })).toHaveLength(1)
    expect(await entitlementsOf(payload, order.id)).toHaveLength(1)
    expect(await countJobs(`order-confirmation-${order.id}`)).toBe(1)
    expect(await ledger(event.id)).toEqual([{ outcome: "applied" }])
    expect((await holdsOf(payload, session.id, "converted")).map((h) => h.id)).toEqual([hold.id])
  })

  it("R6 concurrent first delivery: two simultaneous deliveries of a new event → exactly one order", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id })
    const event = c.event()
    const results = await Promise.all([outcomeOf(event), outcomeOf(event)])
    expect(results.sort()).toEqual(["applied", "skipped"])
    const [order] = await ordersFor(payload, c.csId)
    expect(await enrollmentsOf(payload, { order: order!.id })).toHaveLength(1)
    expect(await entitlementsOf(payload, order!.id)).toHaveLength(1)
    expect(await countJobs(`order-confirmation-${order!.id}`)).toBe(1)
    expect(await ledger(event.id)).toHaveLength(1)
  })

  it("R6 quantity 3 (buyer + 2 guests, one pre-existing customer): 1 order, 3 enrollments, 3 entitlements, 3 customers, 1+2 jobs, Σ seatAmount = total", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const existing = await payload.update({
      collection: "customers",
      id: (await makeCustomer(payload)).id,
      data: { firstName: "Original", lastName: "Name" },
      overrideAccess: true,
    })
    const [g1] = guests(1)
    const attendees = [g1!, { firstName: "Changed", lastName: "Other", email: existing.email.toUpperCase() }]
    const hold = await addHold(payload, session.id, { quantity: 3, attendees })
    const buyerEmail = `buyer-${uid()}@example.com`
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 3, unit: 3333, email: buyerEmail })
    const event = c.event()

    expect(await outcomeOf(event)).toBe("applied")
    expect(await Promise.all([outcomeOf(event), outcomeOf(event)])).toEqual(["skipped", "skipped"])
    expect(await outcomeOf(event)).toBe("skipped")

    const orders = await ordersFor(payload, c.csId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.items?.[0]?.quantity).toBe(3)
    const enrollments = await enrollmentsOf(payload, { order: order.id })
    expect(enrollments.map((e) => e.attendeeIndex)).toEqual([0, 1, 2])
    expect(new Set(enrollments.map((e) => e.customer)).size).toBe(3)
    expect(enrollments.reduce((s, e) => s + Number(e.seatAmount), 0)).toBe(Number(order.total))
    expect(enrollments[0]!.seatAmount).toBe(3333 + 0) // 9999 / 3 → 3333 each, remainder 0
    expect(enrollments[2]!.customer).toBe(existing.id)
    expect(enrollments[1]!.attendeeName).toBe(`${g1!.firstName} ${g1!.lastName}`)

    const unchanged = await payload.findByID({ collection: "customers", id: existing.id, overrideAccess: true })
    expect([unchanged.firstName, unchanged.lastName]).toEqual(["Original", "Name"])
    for (const email of [buyerEmail, g1!.email, existing.email]) {
      const { totalDocs } = await payload.count({ collection: "customers", where: { email: { equals: email.toLowerCase() } }, overrideAccess: true })
      expect(totalDocs).toBe(1)
    }

    expect(await entitlementsOf(payload, order.id)).toHaveLength(3)
    expect(await countJobs(`order-confirmation-${order.id}`)).toBe(1)
    const guestJobs = await jobsLike("enrollment-confirmation-", "enrollment-confirmation")
    const mine = guestJobs.filter((j) => enrollments.slice(1).some((e) => j.key === `enrollment-confirmation-${e.id}`))
    expect(mine).toHaveLength(2)
    const [confirmation] = await jobsLike(`order-confirmation-${order.id}`, "order-confirmation")
    const item = (confirmation!.data.items as { quantity: number; attendees: { email: string }[] }[])[0]!
    expect(item.quantity).toBe(3)
    expect(item.attendees).toHaveLength(2)
  })

  it("remainder cents go to the buyer seat", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 3, attendees: guests(2) })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 3, unit: 3334 })
    const event = c.event()
    const obj = event.data.object as { amount_total: number; total_details: { amount_discount: number } }
    obj.amount_total = 10000 // 2 cents of discount → 10000 / 3
    obj.total_details.amount_discount = 2
    expect(await outcomeOf(event)).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    expect(order!.total).toBe(10000)
    expect(order!.discountTotal).toBe(2)
    const seats = (await enrollmentsOf(payload, { order: order!.id })).map((e) => Number(e.seatAmount))
    expect(seats).toEqual([3334, 3333, 3333])
  })

  it("online course: order + buyer entitlement, no enrollment", async () => {
    const course = await makePurchasableCourse(payload, "online")
    const c = completedEvent(fake, { courseId: course.id })
    expect(await outcomeOf(c.event())).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    expect(await enrollmentsOf(payload, { order: order!.id })).toHaveLength(0)
    expect(await entitlementsOf(payload, order!.id)).toHaveLength(1)
  })

  it("Stripe quantity ≠ metadata quantity → throws (500), nothing written", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 2, attendees: guests(1) })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 2 })
    fake.lineItems.set(c.csId, { quantity: 1, unit: 5000, description: "x" })
    const event = c.event()
    await expect(deliver(event)).rejects.toThrow(/quantity/)
    expect(await ordersFor(payload, c.csId)).toHaveLength(0)
    expect(await ledger(event.id)).toHaveLength(0)
  })

  it("oversell: capacity 1, A's hold expired, B bought the seat → A refunded with key oversell-<id>, B keeps it", async () => {
    const { course, session } = await makeBookableSession(payload, 1)
    const holdA = await addHold(payload, session.id, { quantity: 1, expiresAt: new Date(Date.now() - 60_000) })
    const holdB = await addHold(payload, session.id, { quantity: 1 })
    const b = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdB.id })
    expect(await outcomeOf(b.event())).toBe("applied")

    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id })
    const eventA = a.event()
    expect(await outcomeOf(eventA)).toBe("refunded")
    expect(await outcomeOf(eventA)).toBe("skipped")

    const [orderA] = await ordersFor(payload, a.csId)
    expect(orderA!.status).toBe("refunded")
    expect(orderA!.refunds).toHaveLength(1)
    const refundsA = fake.refunds.filter((r) => r.key === `oversell-${orderA!.id}`)
    expect(refundsA).toHaveLength(1)
    expect(refundsA[0]!.params.amount).toBe(a.total)
    expect(await ledger(eventA.id)).toEqual([{ outcome: "refunded" }])
    expect(await enrollmentsOf(payload, { session: session.id })).toHaveLength(1)
    expect(await entitlementsOf(payload, orderA!.id)).toHaveLength(0)
    expect(await countJobs(`oversell-refund-${orderA!.id}`)).toBe(1)
    expect(await countJobs(`order-confirmation-${orderA!.id}`)).toBe(0)
  })

  it("multi-seat oversell: capacity 3, A (2 seats) expired, B took 2 → whole A refunded, 0 enrollments/entitlements, oversell email quantity 2", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    const holdA = await addHold(payload, session.id, { quantity: 2, attendees: guests(1), expiresAt: new Date(Date.now() - 60_000) })
    const holdB = await addHold(payload, session.id, { quantity: 2, attendees: guests(1) })
    expect(await outcomeOf(completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdB.id, quantity: 2 }).event())).toBe("applied")

    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id, quantity: 2 })
    expect(await outcomeOf(a.event())).toBe("refunded")
    const [orderA] = await ordersFor(payload, a.csId)
    const refunds = fake.refunds.filter((r) => r.key === `oversell-${orderA!.id}`)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.params.amount).toBe(Number(orderA!.total))
    expect(await enrollmentsOf(payload, { order: orderA!.id })).toHaveLength(0)
    expect(await entitlementsOf(payload, orderA!.id)).toHaveLength(0)
    expect(await enrollmentsOf(payload, { session: session.id })).toHaveLength(2)
    const oversell = await jobsLike(`oversell-refund-${orderA!.id}`, "oversell-refund")
    expect(oversell).toHaveLength(1)
    expect(oversell[0]!.data.quantity).toBe(2)
    const guestJobs = await jobsLike("enrollment-confirmation-", "enrollment-confirmation")
    const enrollmentIdsA = (await enrollmentsOf(payload, { order: orderA!.id })).map((e) => e.id)
    expect(guestJobs.filter((j) => enrollmentIdsA.some((id) => j.key.endsWith(`-${id}`)))).toHaveLength(0)
  })

  it("multi-seat variant: capacity 4, A (2 seats) expired, nobody else → enrolled normally, hold converted, applied", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const holdA = await addHold(payload, session.id, { quantity: 2, attendees: guests(1), expiresAt: new Date(Date.now() - 60_000) })
    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id, quantity: 2 })
    expect(await outcomeOf(a.event())).toBe("applied")
    const [orderA] = await ordersFor(payload, a.csId)
    expect(await enrollmentsOf(payload, { order: orderA!.id })).toHaveLength(2)
    expect(await entitlementsOf(payload, orderA!.id)).toHaveLength(2)
    expect((await holdsOf(payload, session.id, "converted")).map((h) => h.id)).toEqual([holdA.id])
  })

  it("W2-21 zero-amount (100 % promo) single seat: order paid total 0, no PI, 1 enrollment/entitlement/job, hold converted; replays no-op", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, zeroAmount: true })
    const event = c.event()
    const refundsBefore = fake.refunds.length

    expect(await outcomeOf(event)).toBe("applied")
    expect(await outcomeOf(event)).toBe("skipped")
    expect(await outcomeOf(event)).toBe("skipped")

    const orders = await ordersFor(payload, c.csId)
    expect(orders).toHaveLength(1)
    const order = orders[0]!
    expect(order.status).toBe("paid")
    expect(order.total).toBe(0)
    expect(order.discountTotal).toBe(Number(order.subtotal))
    expect(order.stripePaymentIntentId ?? null).toBeNull()
    const enrollments = await enrollmentsOf(payload, { order: order.id })
    expect(enrollments).toHaveLength(1)
    expect(enrollments[0]!.seatAmount).toBe(0)
    expect(await entitlementsOf(payload, order.id)).toHaveLength(1)
    expect(await countJobs(`order-confirmation-${order.id}`)).toBe(1)
    expect(await ledger(event.id)).toEqual([{ outcome: "applied" }])
    expect((await holdsOf(payload, session.id, "converted")).map((h) => h.id)).toEqual([hold.id])
    expect(fake.refunds.length).toBe(refundsBefore)

    // refundOrder on a zero-total order → CONFLICT ORDER_NOT_REFUNDABLE, no Stripe call
    const r = await commerce.refundOrder({ orderId: order.id, reason: "test" })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatchObject({ code: "CONFLICT", reason: "ORDER_NOT_REFUNDABLE" })
    expect(fake.refunds.length).toBe(refundsBefore)
  })

  it("W2-21 zero-amount quantity 3: 3 enrollments Σ seatAmount 0, 3 entitlements, 1 + 2 jobs", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 3, attendees: guests(2) })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 3, zeroAmount: true })
    const event = c.event()
    expect(await outcomeOf(event)).toBe("applied")
    expect(await outcomeOf(event)).toBe("skipped")

    const [order] = await ordersFor(payload, c.csId)
    expect(order!.total).toBe(0)
    const enrollments = await enrollmentsOf(payload, { order: order!.id })
    expect(enrollments.map((e) => e.attendeeIndex)).toEqual([0, 1, 2])
    expect(enrollments.map((e) => Number(e.seatAmount))).toEqual([0, 0, 0])
    expect(await entitlementsOf(payload, order!.id)).toHaveLength(3)
    expect(await countJobs(`order-confirmation-${order!.id}`)).toBe(1)
    const guestJobs = await jobsLike("enrollment-confirmation-", "enrollment-confirmation")
    expect(guestJobs.filter((j) => enrollments.slice(1).some((e) => j.key === `enrollment-confirmation-${e.id}`))).toHaveLength(2)
  })

  it("W2-21 zero-amount oversell: no Stripe refund, order cancelled without refunds, hold expired, oversell email refundAmount 0, outcome refunded", async () => {
    const { course, session } = await makeBookableSession(payload, 1)
    const holdA = await addHold(payload, session.id, { quantity: 1, expiresAt: new Date(Date.now() - 60_000) })
    const holdB = await addHold(payload, session.id, { quantity: 1 })
    expect(await outcomeOf(completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdB.id }).event())).toBe("applied")

    const refundsBefore = fake.refunds.length
    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id, zeroAmount: true })
    const eventA = a.event()
    expect(await outcomeOf(eventA)).toBe("refunded")
    expect(await outcomeOf(eventA)).toBe("skipped")
    expect(fake.refunds.length).toBe(refundsBefore)

    const [orderA] = await ordersFor(payload, a.csId)
    expect(orderA!.status).toBe("cancelled")
    expect(orderA!.total).toBe(0)
    expect(orderA!.refunds ?? []).toHaveLength(0)
    expect(await enrollmentsOf(payload, { order: orderA!.id })).toHaveLength(0)
    expect(await entitlementsOf(payload, orderA!.id)).toHaveLength(0)
    expect(await enrollmentsOf(payload, { session: session.id })).toHaveLength(1)
    expect((await holdsOf(payload, session.id, "expired")).map((h) => h.id)).toContain(holdA.id)
    const oversell = await jobsLike(`oversell-refund-${orderA!.id}`, "oversell-refund")
    expect(oversell).toHaveLength(1)
    expect(oversell[0]!.data.refundAmount).toBe(0)
    expect(await countJobs(`order-confirmation-${orderA!.id}`)).toBe(0)
    expect(await ledger(eventA.id)).toEqual([{ outcome: "refunded" }])
  })

  it("W2-21 non-zero total without a PaymentIntent on oversell still throws (500), nothing written", async () => {
    const { course, session } = await makeBookableSession(payload, 1)
    const holdA = await addHold(payload, session.id, { quantity: 1, expiresAt: new Date(Date.now() - 60_000) })
    const holdB = await addHold(payload, session.id, { quantity: 1 })
    expect(await outcomeOf(completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdB.id }).event())).toBe("applied")
    const a = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: holdA.id })
    const event = a.event()
    ;(event.data.object as { payment_intent: string | null }).payment_intent = null
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(deliver(event)).rejects.toThrow(/payment intent/)
    spy.mockRestore()
    expect(await ordersFor(payload, a.csId)).toHaveLength(0)
    expect(await ledger(event.id)).toHaveLength(0)
  })

  it("M-1 foreign Checkout session (Payment Link, no cartToken) → skipped 200, no order", async () => {
    const course = await makePurchasableCourse(payload, "online")
    const c = completedEvent(fake, { courseId: course.id })
    const event = c.event()
    ;(event.data.object as { metadata: Record<string, string> }).metadata = {}
    expect(await outcomeOf(event)).toBe("skipped")
    expect(await ordersFor(payload, c.csId)).toHaveLength(0)
    expect(await ledger(event.id)).toEqual([{ outcome: "skipped" }])
  })

  it("M-1 our session (cartToken) with malformed metadata still throws (500)", async () => {
    const course = await makePurchasableCourse(payload, "online")
    const c = completedEvent(fake, { courseId: course.id })
    const event = c.event()
    ;(event.data.object as { metadata: Record<string, string> }).metadata.quantity = "0"
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await expect(deliver(event)).rejects.toThrow(/metadata/)
    spy.mockRestore()
    expect(await ledger(event.id)).toHaveLength(0)
  })

  it("unpaid completion (async method pending) → skipped, no order", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const hold = await addHold(payload, session.id, { quantity: 1 })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id })
    const event = c.event()
    ;(event.data.object as { payment_status: string }).payment_status = "unpaid"
    expect(await outcomeOf(event)).toBe("skipped")
    expect(await ordersFor(payload, c.csId)).toHaveLength(0)
    expect(await ledger(event.id)).toEqual([{ outcome: "skipped" }])
  })
})
