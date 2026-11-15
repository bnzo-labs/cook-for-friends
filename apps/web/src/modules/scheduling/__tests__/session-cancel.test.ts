/**
 * W4-07 integration (real Postgres via TEST_DATABASE_URL): staff cancels a whole session →
 * every seat fully refunded (remaining refundable amount, M-2 cap), outside the D1 tiers,
 * one seat at a time, idempotent and resumable. Stripe = recording fake at the commerce port;
 * email = queued `send-email` jobs (inspected, not delivered).
 */
import type { Payload } from "payload"
import type Stripe from "stripe"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { makeStaff } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { setStripeForTests } from "../../commerce/server/stripe-port"
import { TEST_WEBHOOK_SECRET, inputOf, jobsFor, makeWebhookFake, paidOrder } from "./ops-helpers"

describe.skipIf(!hasTestDb)("W4-07 session cancel (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../../commerce")
  let scheduling: typeof import("../index")
  let staffId: number
  const fake = makeWebhookFake()
  vi.setConfig({ testTimeout: 180_000 })

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    payload = await getTestPayload()
    commerce = await import("../../commerce")
    scheduling = await import("../index")
    setStripeForTests(fake.client)
    staffId = Number((await makeStaff(payload, "staff")).id)
  }, 60_000)
  afterEach(() => {
    setStripeForTests(fake.client)
    vi.restoreAllMocks()
  })
  afterAll(() => setStripeForTests(null))

  const meta = (r: (typeof fake.refunds)[number]) => (r.params.metadata || {}) as Record<string, string>
  const seatRefunds = (id: number) => fake.refunds.filter((r) => meta(r).enrollmentId === String(id))
  const reload = (id: number) => payload.findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true })
  /** Status flip without a user: the hook queues nothing (no staff actor), the test drives the job itself. */
  const setStatus = (sessionId: number, status: "scheduled" | "cancelled") =>
    payload.update({ collection: "sessions", id: sessionId, data: { status }, overrideAccess: true })
  const sessionJobs = async (sessionId: number) => {
    const res = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "session-cancel" } },
      sort: "-createdAt",
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    return res.docs.filter((d) => Number((d.input as Record<string, unknown> | null)?.["sessionId"]) === sessionId)
  }
  const failingFor = (enrollmentId: number) =>
    ({
      ...fake.client,
      refunds: {
        ...fake.client.refunds,
        create: async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
          if ((params.metadata as Record<string, string> | undefined)?.enrollmentId === String(enrollmentId)) {
            throw Object.assign(new Error("stripe down"), { type: "StripeAPIError" })
          }
          return fake.client.refunds.create(params, options)
        },
      },
    }) as unknown as Stripe

  it("10 h before (policy would give none): every seat refunded in full, emails per seat, waitlist expired; second run is a no-op", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 3, startsInHours: 10 })
    const waiting = await payload.create({
      collection: "waitlist-entries",
      data: { session: o.session.id, email: `wl-${uid()}@example.com`, locale: "fr", status: "waiting" },
      overrideAccess: true,
    })
    await setStatus(o.session.id, "cancelled")

    const first = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(first).toMatchObject({ status: "done", retryable: false, failed: [] })
    expect([...first.refunded].sort()).toEqual(o.seats.map((s) => Number(s.id)).sort())

    for (const seat of o.seats) {
      const refunds = seatRefunds(Number(seat.id))
      expect(refunds).toHaveLength(1)
      expect(refunds[0]!.params.amount).toBe(Number(seat.seatAmount))
      expect(refunds[0]!.key).toBe(`seat-cancel-${seat.id}`)
      expect(await reload(Number(seat.id))).toMatchObject({ status: "cancelled", cancellationOutcome: "refund" })
      const [buyerJob] = await jobsFor(payload, `session-cancel-${seat.id}-buyer`)
      expect(inputOf(buyerJob!)).toMatchObject({
        template: "cancellation-confirmation",
        to: o.buyerEmail,
        data: { recipient: "buyer", reason: "session-cancelled", outcome: "refund", amount: Number(seat.seatAmount) },
      })
    }
    // guests get the attendee notice, the buyer's own seat does not duplicate it
    expect(await jobsFor(payload, `session-cancel-${o.seats[0]!.id}-attendee`)).toHaveLength(0)
    const [guestJob] = await jobsFor(payload, `session-cancel-${o.seats[1]!.id}-attendee`)
    expect(inputOf(guestJob!).data).toMatchObject({ recipient: "attendee", reason: "session-cancelled", amount: 0 })

    const entry = await payload.findByID({ collection: "waitlist-entries", id: waiting.id, depth: 0, overrideAccess: true })
    expect(entry.status).toBe("expired")
    expect(await jobsFor(payload, `waitlist-${waiting.id}`)).toHaveLength(0)

    const second = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(second).toMatchObject({ status: "done", refunded: [], retried: [], failed: [] })
    for (const seat of o.seats) {
      expect(seatRefunds(Number(seat.id))).toHaveLength(1)
      expect(await jobsFor(payload, `session-cancel-${seat.id}-buyer`)).toHaveLength(1)
    }
  })

  it("M-2: Dashboard refund on the order → seats refunded only what is left, never more than the order", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 100 })
    const { chargeRefundedEvent, sign } = await import("../../commerce/__tests__/webhook-helpers")
    const refund = { id: `re_dash_${uid()}`, amount: 7000, payment_intent: o.pi, status: "succeeded", metadata: {}, created: Math.floor(Date.now() / 1000), reason: null }
    const signed = sign(chargeRefundedEvent({ pi: o.pi, amount: Number(o.order.total), refunded: 7000, refunds: [refund] }))
    expect((await commerce.handleStripeEvent(signed.raw, signed.signature)).ok).toBe(true)

    await setStatus(o.session.id, "cancelled")
    const r = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(r).toMatchObject({ status: "done", failed: [] })
    const total = o.seats.reduce((sum, s) => sum + seatRefunds(Number(s.id)).reduce((a, x) => a + Number(x.params.amount), 0), 0)
    expect(total).toBe(Number(o.order.total) - 7000)
    for (const seat of o.seats) expect((await reload(Number(seat.id))).status).toBe("cancelled")
    // the seat with nothing left is cancelled with outcome none
    expect(r.none).toHaveLength(1)
  })

  it("partial Stripe failure → retryable, other seats done; resume refunds only the failed seat, emails once", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 3, startsInHours: 48 })
    const broken = Number(o.seats[1]!.id)
    await setStatus(o.session.id, "cancelled")

    setStripeForTests(failingFor(broken))
    const first = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(first.retryable).toBe(true)
    expect(first.failed).toEqual([expect.objectContaining({ enrollmentId: broken, code: "UPSTREAM" })])
    expect(first.refunded).toHaveLength(2)
    expect((await reload(broken)).status).toBe("cancelled")
    expect(seatRefunds(broken)).toHaveLength(0)
    expect(await jobsFor(payload, `session-cancel-${broken}-buyer`)).toHaveLength(0)

    setStripeForTests(fake.client)
    const resumed = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(resumed).toMatchObject({ status: "done", retryable: false, refunded: [], retried: [broken], failed: [] })
    for (const seat of o.seats) expect(seatRefunds(Number(seat.id))).toHaveLength(1)
    expect(seatRefunds(broken)[0]!.params.amount).toBe(Number(o.seats[1]!.seatAmount))
    expect(await jobsFor(payload, `session-cancel-${broken}-buyer`)).toHaveLength(1)

    const third = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(third).toMatchObject({ refunded: [], retried: [], failed: [] })
    expect(seatRefunds(broken)).toHaveLength(1)
  })

  it("task handler throws while a seat is retryable (Payload retries the job)", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 1, startsInHours: 100 })
    await setStatus(o.session.id, "cancelled")
    setStripeForTests(failingFor(Number(o.seats[0]!.id)))
    const task = scheduling.schedulingJobTasks.find((t) => t.slug === "session-cancel")!
    const handler = task.handler as (args: { input: unknown }) => Promise<unknown>
    await expect(handler({ input: { sessionId: o.session.id, actorId: staffId } })).rejects.toThrow(/session-cancel/)
    setStripeForTests(fake.client)
    await expect(handler({ input: { sessionId: o.session.id, actorId: staffId } })).resolves.toMatchObject({ output: {} })
    expect(seatRefunds(Number(o.seats[0]!.id))).toHaveLength(1)
  })

  it("flip back to scheduled: no refunds; seats stay confirmed", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 100 })
    await setStatus(o.session.id, "cancelled")
    await setStatus(o.session.id, "scheduled")
    const r = await scheduling.cancelSessionSeats({ sessionId: o.session.id, actorId: staffId })
    expect(r).toMatchObject({ status: "not-cancelled", refunded: [] })
    for (const seat of o.seats) {
      expect((await reload(Number(seat.id))).status).toBe("confirmed")
      expect(seatRefunds(Number(seat.id))).toHaveLength(0)
    }
  })

  it("hook: staff → cancelled queues one session-cancel job; → scheduled queues none; re-save while cancelled re-queues (resume)", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 1, startsInHours: 100 })
    const staff = await payload.findByID({ collection: "users", id: staffId, depth: 0, overrideAccess: true })
    const asStaff = { user: { ...staff, collection: "users" } } as never
    const update = (data: Record<string, unknown>) =>
      payload.update({ collection: "sessions", id: o.session.id, data, overrideAccess: true, ...(asStaff as object) })

    await update({ status: "cancelled" })
    const queued = await sessionJobs(o.session.id)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.input).toMatchObject({ sessionId: o.session.id, actorId: staffId })

    await update({ status: "scheduled" })
    expect(await sessionJobs(o.session.id)).toHaveLength(1)

    await update({ status: "cancelled" })
    await update({ notes: "re-save" })
    expect(await sessionJobs(o.session.id)).toHaveLength(3)
  })
})

describe.skipIf(!hasTestDb)("W4-07 staff seat cancel: full vs policy (integration)", () => {
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
  afterEach(() => vi.restoreAllMocks())
  afterAll(() => setStripeForTests(null))

  const meta = (r: (typeof fake.refunds)[number]) => (r.params.metadata || {}) as Record<string, string>
  const seatRefunds = (id: number) => fake.refunds.filter((r) => meta(r).enrollmentId === String(id))

  it("preview at 10 h: policy none/0, full refund = seat amount; staff full → refund 5000", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 10 })
    const seat = Number(o.seats[1]!.id)
    const p = await scheduling.previewStaffCancellation({ enrollmentId: seat })
    expect(p).toMatchObject({
      ok: true,
      data: { allowed: true, policy: { outcome: "none", amount: 0 }, full: { outcome: "refund", amount: 5000 } },
    })
    const staff = await makeStaff(payload, "staff")
    const r = await scheduling.cancelEnrollment({ enrollmentId: seat, by: "staff", actorId: staff.id, mode: "full" })
    expect(r).toEqual({ ok: true, data: { outcome: "refund", amount: 5000 } })
    expect(seatRefunds(seat)).toHaveLength(1)
    const after = await scheduling.previewStaffCancellation({ enrollmentId: seat })
    expect(after).toMatchObject({ ok: true, data: { allowed: false, reason: "NOT_CONFIRMED" } })
  })

  it("staff policy mode = existing behaviour; customer cannot use full", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 48 })
    const c = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "customer", actorId: o.buyerId, mode: "full" })
    expect(!c.ok && c.error.code).toBe("FORBIDDEN")
    expect(seatRefunds(Number(o.seats[1]!.id))).toHaveLength(0)
    const staff = await makeStaff(payload, "staff")
    const s = await scheduling.cancelEnrollment({ enrollmentId: o.seats[1]!.id, by: "staff", actorId: staff.id, mode: "policy" })
    expect(s).toEqual({ ok: true, data: { outcome: "credit", amount: 5000 } })
  })

  describe("routes", () => {
    const authAs = (user: unknown) => vi.spyOn(payload, "auth").mockResolvedValue({ user, permissions: {} } as never)
    const get = () => new Request("http://localhost:3000/api/enrollments/1/cancel", { method: "GET" })
    const post = (body?: unknown) =>
      new Request("http://localhost:3000/api/enrollments/1/cancel", {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

    it("GET preview: staff 200 with both options; customer 403; anonymous 401", async () => {
      const { asUser } = await import("../../../../test/integration")
      const o = await paidOrder(payload, commerce, fake, { quantity: 1, startsInHours: 100 })
      const id = String(o.seats[0]!.id)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      const ok = await scheduling.handleCancelPreview(get(), id)
      expect(ok.status).toBe(200)
      expect(await ok.json()).toMatchObject({ ok: true, data: { full: { outcome: "refund", amount: 5000 }, policy: { outcome: "refund" } } })
      const buyer = await payload.findByID({ collection: "customers", id: o.buyerId, depth: 0, overrideAccess: true })
      authAs(asUser(buyer, "customers"))
      expect((await scheduling.handleCancelPreview(get(), id)).status).toBe(403)
      authAs(null)
      expect((await scheduling.handleCancelPreview(get(), id)).status).toBe(401)
    })

    it("POST { mode: 'full' }: staff 200; customer 403; bad mode 400", async () => {
      const { asUser } = await import("../../../../test/integration")
      const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 10 })
      const buyer = await payload.findByID({ collection: "customers", id: o.buyerId, depth: 0, overrideAccess: true })
      authAs(asUser(buyer, "customers"))
      expect((await scheduling.handleCancel(post({ mode: "full" }), String(o.seats[1]!.id))).status).toBe(403)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      expect((await scheduling.handleCancel(post({ mode: "bogus" }), String(o.seats[1]!.id))).status).toBe(400)
      const res = await scheduling.handleCancel(post({ mode: "full" }), String(o.seats[1]!.id))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, data: { outcome: "refund", amount: 5000 } })
    })
  })
})
