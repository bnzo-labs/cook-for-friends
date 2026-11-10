/**
 * W3-05 integration (real Postgres via TEST_DATABASE_URL): per-seat cancellation policy,
 * emails, waitlist hand-off. Stripe = recording fake at the commerce port; email = queued
 * `send-email` jobs (inspected, not delivered).
 */
import type { Payload } from "payload"
import type Stripe from "stripe"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { makeCustomer, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { setStripeForTests } from "../../commerce/server/stripe-port"
import { HOUR, TEST_WEBHOOK_SECRET, customerEmail, inputOf, jobsFor, makeWebhookFake, moveSession, paidOrder } from "./ops-helpers"

describe.skipIf(!hasTestDb)("W3-05 cancelEnrollment / previewCancellation (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../../commerce")
  let scheduling: typeof import("../index")
  const fake = makeWebhookFake()
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    payload = await getTestPayload()
    commerce = await import("../../commerce")
    scheduling = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterEach(() => {
    setStripeForTests(fake.client)
    vi.restoreAllMocks()
  })
  afterAll(() => setStripeForTests(null))

  const order = (quantity: number, startsInHours: number) => paidOrder(payload, commerce, fake, { quantity, startsInHours })
  const meta = (r: (typeof fake.refunds)[number]) => (r.params.metadata || {}) as Record<string, string>
  const seatRefunds = (id: number) => fake.refunds.filter((r) => meta(r).enrollmentId === String(id))
  const reload = (id: number) => payload.findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true })

  async function addWaiting(sessionId: number, n: number) {
    const ids: number[] = []
    for (let i = 0; i < n; i += 1) {
      const e = await payload.create({
        collection: "waitlist-entries",
        data: { session: sessionId, email: `wl-${i}-${uid()}@example.com`, locale: i % 2 ? "en" : "fr", status: "waiting" },
        overrideAccess: true,
      })
      ids.push(e.id)
    }
    return ids
  }

  it("100 h: buyer cancels a guest seat → refund for that seat only, 2 emails, next 3 waitlisted notified, seat freed", async () => {
    const o = await order(3, 100)
    const guest = o.seats[1]!
    const waiting = await addWaiting(o.session.id, 5)
    const before = await commerce.getAvailableSeats(o.session.id)

    const r = await scheduling.cancelEnrollment({ enrollmentId: guest.id, by: "customer", actorId: o.buyerId })
    expect(r).toEqual({ ok: true, data: { outcome: "refund", amount: 5000 } })

    expect(await commerce.getAvailableSeats(o.session.id)).toBe(before + 1)
    expect(seatRefunds(guest.id)).toHaveLength(1)
    expect(seatRefunds(guest.id)[0]!.params.amount).toBe(5000)
    expect(seatRefunds(o.seats[0]!.id)).toHaveLength(0)
    expect(seatRefunds(o.seats[2]!.id)).toHaveLength(0)
    expect((await reload(guest.id)).status).toBe("cancelled")

    const buyerJobs = await jobsFor(payload, `cancel-${guest.id}-buyer`)
    const guestJobs = await jobsFor(payload, `cancel-${guest.id}-attendee`)
    expect(buyerJobs).toHaveLength(1)
    expect(guestJobs).toHaveLength(1)
    expect(inputOf(buyerJobs[0]!)).toMatchObject({
      template: "cancellation-confirmation",
      to: o.buyerEmail,
      data: { recipient: "buyer", outcome: "refund", amount: 5000, orderNumber: o.order.number },
    })
    const attendee = inputOf(guestJobs[0]!)
    expect(attendee.to).toBe(await customerEmail(payload, guest.customer as number))
    expect(attendee.data).toMatchObject({ recipient: "attendee", amount: 0 })
    expect(attendee.data.creditCode).toBeUndefined()

    for (const [i, id] of waiting.entries()) {
      const entry = await payload.findByID({ collection: "waitlist-entries", id, depth: 0, overrideAccess: true })
      expect(entry.status).toBe(i < 3 ? "notified" : "waiting")
      expect(await jobsFor(payload, `waitlist-${id}`)).toHaveLength(i < 3 ? 1 : 0)
    }
  })

  it("48 h: credit code emailed to the buyer; buyer's own seat", async () => {
    const o = await order(2, 48)
    const own = o.seats[0]!
    const r = await scheduling.cancelEnrollment({ enrollmentId: own.id, by: "customer", actorId: o.buyerId })
    expect(r).toEqual({ ok: true, data: { outcome: "credit", amount: 5000 } })
    expect(seatRefunds(own.id)).toHaveLength(0)
    const [job] = await jobsFor(payload, `cancel-${own.id}-buyer`)
    const data = inputOf(job!).data
    expect(data).toMatchObject({ recipient: "buyer", outcome: "credit", amount: 5000 })
    expect(String(data.creditCode)).toMatch(/^CFF-CR-/)
    expect(data.creditExpiresAt).toBeTruthy()
    // buyer == attendee → no second email
    expect(await jobsFor(payload, `cancel-${own.id}-attendee`)).toHaveLength(0)
  })

  it("10 h: outcome none, seat freed, no money moves", async () => {
    const o = await order(2, 10)
    const guest = o.seats[1]!
    const before = await commerce.getAvailableSeats(o.session.id)
    const r = await scheduling.cancelEnrollment({ enrollmentId: guest.id, by: "customer", actorId: o.buyerId })
    expect(r).toEqual({ ok: true, data: { outcome: "none", amount: 0 } })
    expect(await commerce.getAvailableSeats(o.session.id)).toBe(before + 1)
    expect(seatRefunds(guest.id)).toHaveLength(0)
    expect(await reload(guest.id)).toMatchObject({ status: "cancelled", cancellationOutcome: "none" })
    expect(inputOf((await jobsFor(payload, `cancel-${guest.id}-buyer`))[0]!).data).toMatchObject({ outcome: "none", amount: 0 })
  })

  it("exact boundaries: 72 h → refund, just under → credit", async () => {
    const a = await order(1, 72.02) // test run takes a few seconds: stay safely above 72 h
    expect((await scheduling.previewCancellation({ enrollmentId: a.seats[0]!.id, actorCustomerId: a.buyerId }))).toMatchObject({
      ok: true,
      data: { outcome: "refund" },
    })
    await moveSession(payload, a.session.id, 71.9)
    expect((await scheduling.previewCancellation({ enrollmentId: a.seats[0]!.id, actorCustomerId: a.buyerId }))).toMatchObject({
      ok: true,
      data: { outcome: "credit" },
    })
  })

  it("guest and unrelated customer cannot cancel (FORBIDDEN); seat untouched", async () => {
    const o = await order(2, 100)
    const guest = o.seats[1]!
    const g = await scheduling.cancelEnrollment({ enrollmentId: guest.id, by: "customer", actorId: guest.customer as number })
    expect(!g.ok && g.error.code).toBe("FORBIDDEN")
    const other = await makeCustomer(payload)
    const x = await scheduling.cancelEnrollment({ enrollmentId: guest.id, by: "customer", actorId: other.id })
    expect(!x.ok && x.error.code).toBe("FORBIDDEN")
    expect((await reload(guest.id)).status).toBe("confirmed")
    expect(seatRefunds(guest.id)).toHaveLength(0)
    expect(await jobsFor(payload, `cancel-${guest.id}-buyer`)).toHaveLength(0)
  })

  it("staff cancels any seat; outcome still follows the policy", async () => {
    const o = await order(2, 30)
    const staff = await makeStaff(payload, "staff")
    const r = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "staff", actorId: staff.id })
    expect(r).toEqual({ ok: true, data: { outcome: "credit", amount: 5000 } })
  })

  it("staff may cancel after the session started (policy → none); customer cannot", async () => {
    const o = await order(2, 100)
    await moveSession(payload, o.session.id, -2)
    const c = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "customer", actorId: o.buyerId })
    expect(!c.ok && c.error).toMatchObject({ code: "CONFLICT", reason: "SESSION_STARTED" })
    const staff = await makeStaff(payload, "staff")
    const s = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "staff", actorId: staff.id })
    expect(s).toEqual({ ok: true, data: { outcome: "none", amount: 0 } })
  })

  it("customerCanSelfCancel=false → customer FORBIDDEN, staff still can; restored after", async () => {
    const prior = await payload.findGlobal({ slug: "cancellation-policy", depth: 0, overrideAccess: true })
    await payload.updateGlobal({ slug: "cancellation-policy", data: { customerCanSelfCancel: false }, overrideAccess: true })
    try {
      const o = await order(2, 100)
      const c = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "customer", actorId: o.buyerId })
      expect(!c.ok && c.error.code).toBe("FORBIDDEN")
      const p = await scheduling.previewCancellation({ enrollmentId: o.seats[1]!.id, actorCustomerId: o.buyerId })
      expect(p).toMatchObject({ ok: true, data: { allowed: false, reason: "SELF_CANCEL_DISABLED" } })
      const staff = await makeStaff(payload, "staff")
      const s = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "staff", actorId: staff.id })
      expect(s.ok).toBe(true)
    } finally {
      await payload.updateGlobal({
        slug: "cancellation-policy",
        data: { customerCanSelfCancel: prior.customerCanSelfCancel ?? true },
        overrideAccess: true,
      })
    }
  })

  it("custom tiers from the global replace the default", async () => {
    const prior = await payload.findGlobal({ slug: "cancellation-policy", depth: 0, overrideAccess: true })
    await payload.updateGlobal({
      slug: "cancellation-policy",
      data: { tiers: [{ minHoursBefore: 0, outcome: "refund", percent: 50 }] },
      overrideAccess: true,
    })
    try {
      const o = await order(2, 5)
      const p = await scheduling.previewCancellation({ enrollmentId: o.seats[1]!.id, actorCustomerId: o.buyerId })
      expect(p).toMatchObject({ ok: true, data: { allowed: true, outcome: "refund", percent: 50, amount: 2500 } })
    } finally {
      await payload.updateGlobal({
        slug: "cancellation-policy",
        data: { tiers: (prior.tiers ?? []).map(({ minHoursBefore, outcome, percent }) => ({ minHoursBefore, outcome, percent })) },
        overrideAccess: true,
      })
    }
  })

  it("double cancel → CONFLICT; unknown seat → NOT_FOUND; bad input → VALIDATION", async () => {
    const o = await order(2, 100)
    const seat = o.seats[1]!
    const first = await scheduling.cancelEnrollment({ enrollmentId: seat.id, by: "customer", actorId: o.buyerId })
    expect(first.ok).toBe(true)
    // refund already requested at Stripe (webhook not yet applied) → no second refund
    const again = await scheduling.cancelEnrollment({ enrollmentId: seat.id, by: "customer", actorId: o.buyerId })
    expect(!again.ok && again.error.code).toBe("CONFLICT")
    expect(seatRefunds(seat.id)).toHaveLength(1)

    const missing = await scheduling.cancelEnrollment({ enrollmentId: 2_000_000_000, by: "staff", actorId: 1 })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
    const bad = await scheduling.cancelEnrollment({ enrollmentId: "x", by: "staff", actorId: 1 })
    expect(!bad.ok && bad.error.code).toBe("VALIDATION")
  })

  it("Stripe failure → UPSTREAM (no emails), retry succeeds, emails exactly once", async () => {
    const o = await order(2, 100)
    const seat = o.seats[1]!
    const failing = {
      ...fake.client,
      refunds: {
        ...fake.client.refunds,
        create: async () => {
          throw Object.assign(new Error("stripe down"), { type: "StripeAPIError" })
        },
      },
    } as unknown as Stripe
    setStripeForTests(failing)
    const first = await scheduling.cancelEnrollment({ enrollmentId: seat.id, by: "customer", actorId: o.buyerId })
    expect(!first.ok && first.error.code).toBe("UPSTREAM")
    expect((await reload(seat.id)).status).toBe("cancelled")
    expect(await jobsFor(payload, `cancel-${seat.id}-buyer`)).toHaveLength(0)

    setStripeForTests(fake.client)
    const retry = await scheduling.cancelEnrollment({ enrollmentId: seat.id, by: "customer", actorId: o.buyerId })
    expect(retry).toEqual({ ok: true, data: { outcome: "refund", amount: 5000 } })
    expect(seatRefunds(seat.id)).toHaveLength(1)
    expect(await jobsFor(payload, `cancel-${seat.id}-buyer`)).toHaveLength(1)
    expect(await jobsFor(payload, `cancel-${seat.id}-attendee`)).toHaveLength(1)

    // refund in flight: a further call neither refunds nor emails again
    const third = await scheduling.cancelEnrollment({ enrollmentId: seat.id, by: "customer", actorId: o.buyerId })
    expect(!third.ok && third.error.code).toBe("CONFLICT")
    expect(await jobsFor(payload, `cancel-${seat.id}-buyer`)).toHaveLength(1)
  })

  it("previewCancellation: tier math, deadline of the current tier, NOT_BUYER, NOT_CONFIRMED", async () => {
    const o = await order(2, 48)
    const guest = o.seats[1]!
    const p = await scheduling.previewCancellation({ enrollmentId: guest.id, actorCustomerId: o.buyerId })
    expect(p.ok && p.data).toMatchObject({ allowed: true, outcome: "credit", percent: 100, amount: 5000 })
    if (!p.ok) throw new Error("unreachable")
    expect(p.data.hoursBefore).toBeGreaterThan(47.9)
    expect(p.data.hoursBefore).toBeLessThanOrEqual(48)
    expect(Math.abs(new Date(p.data.deadlineNextTier!).getTime() - (o.startsAt.getTime() - 24 * HOUR))).toBeLessThan(1000)

    const g = await scheduling.previewCancellation({ enrollmentId: guest.id, actorCustomerId: guest.customer as number })
    expect(g).toMatchObject({ ok: true, data: { allowed: false, reason: "NOT_BUYER" } })

    await scheduling.cancelEnrollment({ enrollmentId: guest.id, by: "customer", actorId: o.buyerId })
    const done = await scheduling.previewCancellation({ enrollmentId: guest.id, actorCustomerId: o.buyerId })
    expect(done).toMatchObject({ ok: true, data: { allowed: false, reason: "NOT_CONFIRMED" } })
    const missing = await scheduling.previewCancellation({ enrollmentId: 2_000_000_000 })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
  })

  describe("POST /api/enrollments/:id/cancel (route handler)", () => {
    const req = (init: { origin?: string } = {}) =>
      new Request("http://localhost:3000/api/enrollments/1/cancel", {
        method: "POST",
        headers: init.origin ? { origin: init.origin } : {},
      })
    const authAs = (user: unknown) => vi.spyOn(payload, "auth").mockResolvedValue({ user, permissions: {} } as never)

    it("anonymous → 401; foreign origin → 403; bad id → 404", async () => {
      authAs(null)
      expect((await scheduling.handleCancel(req(), "1")).status).toBe(401)
      expect((await scheduling.handleCancel(req({ origin: "https://evil.example" }), "1")).status).toBe(403)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      expect((await scheduling.handleCancel(req(), "abc")).status).toBe(404)
    })

    it("buyer → 200 { outcome, amount }; unrelated customer → 404; guest → 403", async () => {
      const o = await order(2, 100)
      const guest = o.seats[1]!
      const stranger = await makeCustomer(payload)
      authAs(asUser(stranger, "customers"))
      expect((await scheduling.handleCancel(req(), String(guest.id))).status).toBe(404)

      const guestDoc = await payload.findByID({ collection: "customers", id: guest.customer as number, depth: 0, overrideAccess: true })
      authAs(asUser(guestDoc, "customers"))
      const forbidden = await scheduling.handleCancel(req(), String(guest.id))
      expect(forbidden.status).toBe(403)

      const buyerDoc = await payload.findByID({ collection: "customers", id: o.buyerId, depth: 0, overrideAccess: true })
      authAs(asUser(buyerDoc, "customers"))
      const ok = await scheduling.handleCancel(req(), String(guest.id))
      expect(ok.status).toBe(200)
      expect(await ok.json()).toEqual({ ok: true, data: { outcome: "refund", amount: 5000 } })
      const again = await scheduling.handleCancel(req(), String(guest.id))
      expect(again.status).toBe(409)
    })

    it("staff → 200", async () => {
      const o = await order(2, 100)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      const res = await scheduling.handleCancel(req(), String(o.seats[1]!.id))
      expect(res.status).toBe(200)
    })
  })
})
