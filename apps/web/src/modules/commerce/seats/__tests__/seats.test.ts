/**
 * W3-09 integration (real Postgres via TEST_DATABASE_URL): per-seat cancellation
 * money path, credit codes, customer reads, attendance, enrollments access.
 * Stripe = recording fake at the commerce port (same double as W2-07).
 */
import type { Payload } from "payload"
import type Stripe from "stripe"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { makeStaff } from "../../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb } from "../../../../../test/integration"
import { addHold, guests, makeBookableSession } from "../../__tests__/helpers"
import {
  TEST_WEBHOOK_SECRET,
  chargeRefundedEvent,
  completedEvent,
  enrollmentsOf,
  entitlementsOf,
  makeWebhookFake,
  ordersFor,
  sign,
} from "../../__tests__/webhook-helpers"
import { setStripeForTests } from "../../server/stripe-port"
import { setSeatFaultForTests } from "../cancel"
import { CREDIT_CODE_PATTERN } from "../credit"

const seatReleased = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/modules/scheduling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/scheduling")>()),
  onSeatReleased: seatReleased,
}))

describe.skipIf(!hasTestDb)("W3-09 seat operations (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../../index")
  const fake = makeWebhookFake()
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    payload = await getTestPayload()
    commerce = await import("../../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterEach(() => {
    setStripeForTests(fake.client)
    setSeatFaultForTests(null)
  })
  afterAll(() => setStripeForTests(null))

  const deliver = async (event: object) => {
    const { raw, signature } = sign(event)
    const r = await commerce.handleStripeEvent(raw, signature)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return r.data.outcome
  }

  /** Paid in-person order of `quantity` seats through the real W2-07 webhook (5000 ¢ per seat). */
  async function paidOrder(quantity: number) {
    const { course, session } = await makeBookableSession(payload, 6)
    const hold = await addHold(payload, session.id, { quantity, attendees: guests(quantity - 1) })
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity })
    expect(await deliver(c.event())).toBe("applied")
    const [order] = await ordersFor(payload, c.csId)
    const seats = await enrollmentsOf(payload, { order: order!.id })
    expect(seats).toHaveLength(quantity)
    return { course, session, c, order: order!, seats, buyerId: Number(order!.customer) }
  }

  const meta = (r: (typeof fake.refunds)[number]) => (r.params.metadata || {}) as Record<string, string>
  const seatRefunds = (enrollmentId: number) => fake.refunds.filter((r) => meta(r).enrollmentId === String(enrollmentId))
  const reloadSeat = (id: number) => payload.findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true })
  const staffActor = { by: "staff" as const, actorId: 1, reason: "test cancellation" }

  it("refund path, 3 seats: cancel seat #2 only → cancelled, guest entitlement revoked, Stripe refund with metadata + key; charge.refunded → refunded + linked", async () => {
    const { c, order, seats } = await paidOrder(3)
    const seat2 = seats[1]!
    expect(seat2.seatAmount).toBe(5000)

    const r = await commerce.executeSeatCancellation({ enrollmentId: seat2.id, outcome: "refund", amount: 4000, ...staffActor })
    expect(r).toEqual({ ok: true, data: { enrollmentStatus: "cancelled", refundRequested: true } })

    const after = await enrollmentsOf(payload, { order: order.id })
    expect(after.map((e) => e.status)).toEqual(["confirmed", "cancelled", "confirmed"])
    expect(after[1]).toMatchObject({ cancellationOutcome: "refund" })
    expect(after[1]!.cancelledAt).toBeTruthy()

    const ents = await entitlementsOf(payload, order.id)
    expect(ents).toHaveLength(3)
    const byCustomer = new Map(ents.map((e) => [Number(e.customer), e]))
    expect(byCustomer.get(Number(seat2.customer))!.revokedAt).toBeTruthy()
    expect(ents.filter((e) => e.revokedAt)).toHaveLength(1)

    const calls = seatRefunds(seat2.id)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.key).toBe(`seat-cancel-${seat2.id}`)
    expect(calls[0]!.params).toMatchObject({ payment_intent: c.pi, amount: 4000, metadata: { enrollmentId: String(seat2.id), orderId: String(order.id) } })

    // Stripe → charge.refunded for that seat's refund
    expect(await deliver(chargeRefundedEvent({ pi: c.pi, amount: c.total, refunded: 4000, refunds: [calls[0]!.refund] }))).toBe("applied")
    const [o2] = await ordersFor(payload, c.csId)
    expect(o2!.status).toBe("partially_refunded")
    expect(o2!.refunds?.map((x) => x.enrollment)).toEqual([seat2.id])
    expect((await enrollmentsOf(payload, { order: order.id })).map((e) => e.status)).toEqual(["confirmed", "refunded", "confirmed"])
    expect(seatReleased).not.toHaveBeenCalled()

    // seat now refunded → re-call is a CONFLICT, no new Stripe call
    const again = await commerce.executeSeatCancellation({ enrollmentId: seat2.id, outcome: "refund", amount: 1000, ...staffActor })
    expect(!again.ok && again.error.code).toBe("CONFLICT")
    expect(seatRefunds(seat2.id)).toHaveLength(1)

    const view = await commerce.getEnrollmentView(seat2.id)
    expect(view).toMatchObject({ status: "refunded", seatAmount: 5000, refundedAmount: 4000, cancellationOutcome: "refund" })
  })

  it("same seat cancelled twice concurrently → one success, one CONFLICT, one Stripe refund", async () => {
    const { seats } = await paidOrder(2)
    const seat = seats[1]!
    const results = await Promise.all([
      commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 5000, ...staffActor }),
      commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 5000, ...staffActor }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const failed = results.filter((r) => !r.ok)
    expect(failed).toHaveLength(1)
    expect(!failed[0]!.ok && failed[0]!.error.code).toBe("CONFLICT")
    expect(seatRefunds(seat.id)).toHaveLength(1)
    expect((await reloadSeat(seat.id)).status).toBe("cancelled")
  })

  it("Stripe failure → UPSTREAM, seat stays cancelled; re-call retries the refund once with the same key", async () => {
    const { seats, order } = await paidOrder(2)
    const seat = seats[1]!
    let attempts = 0
    const failing = {
      ...fake.client,
      refunds: {
        ...fake.client.refunds,
        create: async () => {
          attempts += 1
          throw Object.assign(new Error("stripe down"), { type: "StripeAPIError" })
        },
      },
    } as unknown as Stripe
    setStripeForTests(failing)

    const first = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 2500, ...staffActor })
    expect(first.ok).toBe(false)
    expect(!first.ok && first.error.code).toBe("UPSTREAM")
    expect(attempts).toBe(1)
    expect(await reloadSeat(seat.id)).toMatchObject({ status: "cancelled", cancellationOutcome: "refund" })
    expect((await entitlementsOf(payload, order.id)).filter((e) => e.revokedAt)).toHaveLength(1)

    setStripeForTests(fake.client)
    const retry = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 2500, ...staffActor })
    expect(retry).toEqual({ ok: true, data: { enrollmentStatus: "cancelled", refundRequested: true } })
    expect(seatRefunds(seat.id)).toHaveLength(1)
    expect(seatRefunds(seat.id)[0]!.key).toBe(`seat-cancel-${seat.id}`)

    // refund in flight (webhook not yet arrived) → a third call does not refund again
    const third = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 2500, ...staffActor })
    expect(!third.ok && third.error).toMatchObject({ code: "CONFLICT", reason: "REFUND_ALREADY_REQUESTED" })
    expect(seatRefunds(seat.id)).toHaveLength(1)
  })

  it("amount > seatAmount → VALIDATION, seat untouched; unknown enrollment → NOT_FOUND", async () => {
    const { seats } = await paidOrder(2)
    const seat = seats[1]!
    const r = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "refund", amount: 5001, ...staffActor })
    expect(!r.ok && r.error.code).toBe("VALIDATION")
    expect((await reloadSeat(seat.id)).status).toBe("confirmed")
    expect(seatRefunds(seat.id)).toHaveLength(0)
    const credit = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "credit", amount: 5001, ...staffActor })
    expect(!credit.ok && credit.error.code).toBe("VALIDATION")
    const missing = await commerce.executeSeatCancellation({ enrollmentId: 2_000_000_000, outcome: "none", amount: 0, ...staffActor })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
  })

  it("outcome none / amount 0 → cancelled, entitlement revoked, no Stripe call, no code", async () => {
    const { seats, order } = await paidOrder(2)
    const seat = seats[1]!
    const codesBefore = await payload.count({ collection: "discount-codes", where: { personalFor: { equals: Number(order.customer) } }, overrideAccess: true })
    const r = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "none", amount: 0, ...staffActor })
    expect(r).toEqual({ ok: true, data: { enrollmentStatus: "cancelled", refundRequested: false } })
    const zeroRefund = await commerce.executeSeatCancellation({ enrollmentId: seats[0]!.id, outcome: "refund", amount: 0, ...staffActor })
    expect(zeroRefund).toEqual({ ok: true, data: { enrollmentStatus: "cancelled", refundRequested: false } })
    expect(fake.refunds.filter((x) => meta(x).orderId === String(order.id))).toHaveLength(0)
    const codesAfter = await payload.count({ collection: "discount-codes", where: { personalFor: { equals: Number(order.customer) } }, overrideAccess: true })
    expect(codesAfter.totalDocs).toBe(codesBefore.totalDocs)
    expect((await entitlementsOf(payload, order.id)).every((e) => e.revokedAt)).toBe(true)
  })

  it("credit path: personal code for the BUYER in the tx (+365 d, single use, sync job queued); no Stripe refund", async () => {
    const { seats, order, buyerId } = await paidOrder(3)
    const seat = seats[2]!
    const before = Date.now()
    const r = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "credit", amount: 5000, by: "customer", actorId: buyerId, reason: "late cancel" })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error("unreachable")
    expect(r.data).toMatchObject({ enrollmentStatus: "cancelled", refundRequested: false })
    expect(r.data.creditCode).toMatch(CREDIT_CODE_PATTERN)

    const { docs } = await payload.find({ collection: "discount-codes", where: { code: { equals: r.data.creditCode } }, depth: 0, overrideAccess: true })
    const dc = docs[0]!
    expect(dc).toMatchObject({ kind: "amount", value: 5000, maxRedemptions: 1, active: true, personalFor: buyerId })
    const expiry = new Date(dc.expiresAt!).getTime()
    expect(expiry - before).toBeGreaterThanOrEqual(365 * 86_400_000 - 5_000)
    expect(expiry - before).toBeLessThanOrEqual(365 * 86_400_000 + 120_000)
    expect(new Date(r.data.creditExpiresAt!).getTime()).toBe(expiry)

    const jobs = await payload.find({ collection: "payload-jobs", where: { taskSlug: { equals: "stripe-sync-discount" } }, pagination: false, depth: 0, overrideAccess: true })
    expect(jobs.docs.filter((j) => (j.input as { discountCodeId?: number } | null)?.discountCodeId === dc.id)).toHaveLength(1)

    expect(fake.refunds.filter((x) => meta(x).orderId === String(order.id))).toHaveLength(0)
    expect((await reloadSeat(seat.id))).toMatchObject({ status: "cancelled", cancellationOutcome: "credit" })
    const second = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "credit", amount: 5000, ...staffActor })
    expect(!second.ok && second.error.code).toBe("CONFLICT")
  })

  it("credit rollback: throw after the code insert → no code, no job, seat still confirmed, entitlement intact", async () => {
    const { seats, order, buyerId } = await paidOrder(2)
    const seat = seats[1]!
    const count = () => payload.count({ collection: "discount-codes", where: { personalFor: { equals: buyerId } }, overrideAccess: true })
    const before = (await count()).totalDocs
    setSeatFaultForTests(() => {
      throw new Error("forced fault after credit insert")
    })
    await expect(commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "credit", amount: 5000, ...staffActor })).rejects.toThrow(/forced fault/)
    setSeatFaultForTests(null)
    expect((await count()).totalDocs).toBe(before)
    expect((await reloadSeat(seat.id)).status).toBe("confirmed")
    expect((await entitlementsOf(payload, order.id)).every((e) => !e.revokedAt)).toBe(true)

    // and it works afterwards
    const ok = await commerce.executeSeatCancellation({ enrollmentId: seat.id, outcome: "credit", amount: 5000, ...staffActor })
    expect(ok.ok).toBe(true)
  })

  it("issueCreditCode: standalone personal code; unknown customer → NOT_FOUND; amount ≤ 0 → VALIDATION", async () => {
    const { buyerId } = await paidOrder(1)
    const r = await commerce.issueCreditCode({ customerId: buyerId, amount: 1234, reason: "goodwill" })
    expect(r.ok && r.data.code).toMatch(CREDIT_CODE_PATTERN)
    const missing = await commerce.issueCreditCode({ customerId: 2_000_000_000, amount: 100, reason: "x" })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
    const zero = await commerce.issueCreditCode({ customerId: buyerId, amount: 0, reason: "x" })
    expect(!zero.ok && zero.error.code).toBe("VALIDATION")
  })

  it("reads: buyer sees own + guest seats (bookedByMe); guest sees only own seat; orders newest first with hasReceipt; view fields", async () => {
    const first = await paidOrder(1)
    const { seats, order, buyerId, session, course } = await paidOrder(3)
    // second order for the same buyer: reuse the buyer by re-pointing it (fixture shortcut)
    await payload.update({ collection: "orders", id: first.order.id, data: { customer: buyerId, paidAt: new Date(Date.now() - 86_400_000).toISOString() }, overrideAccess: true })
    await payload.update({ collection: "orders", id: order.id, data: { invoicePdfUrl: "https://example.com/inv.pdf" }, overrideAccess: true })

    const mine = await commerce.listCustomerEnrollments(buyerId)
    const ofOrder = mine.filter((v) => v.orderId === order.id)
    expect(ofOrder.map((v) => v.attendeeIndex)).toEqual([0, 1, 2])
    expect(ofOrder.every((v) => v.bookedByMe)).toBe(true)
    expect(ofOrder.map((v) => v.isOwnSeat)).toEqual([true, false, false])

    const guestId = Number(seats[1]!.customer)
    const guestView = await commerce.listCustomerEnrollments(guestId)
    expect(guestView).toHaveLength(1)
    expect(guestView[0]).toMatchObject({ id: seats[1]!.id, isOwnSeat: true, bookedByMe: false, buyerCustomerId: buyerId })

    const orders = await commerce.listCustomerOrders(buyerId)
    expect(orders.map((o) => o.id).slice(0, 2)).toEqual([order.id, first.order.id])
    expect(orders[0]).toMatchObject({ number: order.number, status: "paid", total: 15000, currency: "cad", hasReceipt: true })
    expect(orders[0]!.items[0]).toMatchObject({ courseId: course.id, sessionId: session.id, quantity: 3 })
    expect(orders[1]!.hasReceipt).toBe(false)

    const v = await commerce.getEnrollmentView(seats[2]!.id, buyerId)
    expect(v).toMatchObject({
      id: seats[2]!.id,
      buyerCustomerId: buyerId,
      attendeeCustomerId: Number(seats[2]!.customer),
      sessionId: session.id,
      courseId: course.id,
      orderId: order.id,
      orderNumber: order.number,
      seatAmount: 5000,
      refundedAmount: 0,
      status: "confirmed",
      isOwnSeat: false,
      bookedByMe: true,
    })
    expect(await commerce.getEnrollmentView(seats[2]!.id, guestId)).toBeNull() // guest #1 is unrelated to seat #3
    expect(await commerce.getEnrollmentView(2_000_000_000)).toBeNull()
  })

  it("access: customer read of a guest seat in own order → visible; another order's seat → not visible", async () => {
    const a = await paidOrder(2)
    const b = await paidOrder(2)
    const buyerA = await payload.findByID({ collection: "customers", id: a.buyerId, depth: 0, overrideAccess: true })
    const user = asUser(buyerA, "customers")
    const visible = await payload.find({ collection: "enrollments", where: { id: { in: [...a.seats, ...b.seats].map((s) => s.id) } }, overrideAccess: false, user, depth: 0, pagination: false })
    expect(visible.docs.map((d) => d.id).sort()).toEqual(a.seats.map((s) => s.id).sort())
    await expect(payload.findByID({ collection: "enrollments", id: b.seats[1]!.id, overrideAccess: false, user, depth: 0 })).rejects.toThrow()

    // guest of A sees only their own seat
    const guestA = await payload.findByID({ collection: "customers", id: Number(a.seats[1]!.customer), depth: 0, overrideAccess: true })
    const g = await payload.find({ collection: "enrollments", where: { id: { in: a.seats.map((s) => s.id) } }, overrideAccess: false, user: asUser(guestA, "customers"), depth: 0, pagination: false })
    expect(g.docs.map((d) => d.id)).toEqual([a.seats[1]!.id])
  })

  it("setEnrollmentAttendance: staff only; cancelled seat → CONFLICT; listAttendees carries attendee locale", async () => {
    const { seats, session } = await paidOrder(2)
    const staff = await makeStaff(payload, "staff")
    const r = await commerce.setEnrollmentAttendance({ enrollmentId: seats[0]!.id, attendance: "present", staffId: staff.id })
    expect(r.ok).toBe(true)
    expect((await reloadSeat(seats[0]!.id)).attendance).toBe("present")

    const notStaff = await commerce.setEnrollmentAttendance({ enrollmentId: seats[0]!.id, attendance: "absent", staffId: 2_000_000_000 })
    expect(!notStaff.ok && notStaff.error.code).toBe("FORBIDDEN")

    await commerce.executeSeatCancellation({ enrollmentId: seats[1]!.id, outcome: "none", amount: 0, ...staffActor })
    const cancelled = await commerce.setEnrollmentAttendance({ enrollmentId: seats[1]!.id, attendance: "present", staffId: staff.id })
    expect(!cancelled.ok && cancelled.error.code).toBe("CONFLICT")

    await payload.update({ collection: "customers", id: Number(seats[1]!.customer), data: { preferredLocale: "en" }, overrideAccess: true })
    const rows = await commerce.listAttendees(session.id)
    const byId = new Map(rows.map((x) => [Number(x.enrollmentId), x]))
    expect(byId.get(seats[1]!.id)!.locale).toBe("en")
    expect(byId.get(seats[0]!.id)!.locale).toBe("fr")
  })
})
