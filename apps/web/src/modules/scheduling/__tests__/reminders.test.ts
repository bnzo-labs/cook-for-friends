/** W3-05 integration: reminders (exactly-once, guests, locales, ics), cron route, attendance route. */
import type { Payload } from "payload"
import { NextRequest } from "next/server"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { makeCustomer, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb } from "../../../../test/integration"
import { setStripeForTests } from "../../commerce/server/stripe-port"
import { HOUR, TEST_WEBHOOK_SECRET, inputOf, jobsFor, makeWebhookFake, paidOrder } from "./ops-helpers"

const hooks = vi.hoisted(() => ({ failKey: null as string | null }))
vi.mock("@/modules/notifications", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/notifications")>()
  return {
    ...real,
    enqueueEmail: ((i: Parameters<typeof real.enqueueEmail>[0]) => {
      if (hooks.failKey !== null && i.idempotencyKey === hooks.failKey) {
        hooks.failKey = null
        return Promise.reject(new Error("queue down"))
      }
      return real.enqueueEmail(i)
    }) as typeof real.enqueueEmail,
  }
})

describe.skipIf(!hasTestDb)("W3-05 reminders + attendance (integration)", () => {
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

  const order = (quantity: number, startsInHours: number) => paidOrder(payload, commerce, fake, { quantity, startsInHours })
  const deliveries = async (enrollmentId: number) =>
    (await payload.find({ collection: "reminder-deliveries", where: { enrollment: { equals: enrollmentId } }, depth: 0, overrideAccess: true })).docs
  const at = (start: Date, hoursBefore: number) => new Date(start.getTime() - hoursBefore * HOUR)

  it("48 h window: buyer + guest each get one reminder in their own locale with .ics and account link; re-run sends nothing", async () => {
    const o = await order(2, 100)
    const [buyerSeat, guestSeat] = o.seats
    await payload.update({ collection: "customers", id: guestSeat!.customer as number, data: { preferredLocale: "en" }, overrideAccess: true })
    await payload.update({ collection: "customers", id: o.buyerId, data: { preferredLocale: "fr" }, overrideAccess: true })

    expect((await scheduling.sendDueReminders(at(o.startsAt, 60))).sent).toBeGreaterThanOrEqual(0)
    expect(await deliveries(buyerSeat!.id)).toHaveLength(0) // 60 h out: no window yet

    const run = await scheduling.sendDueReminders(at(o.startsAt, 47))
    expect(run.sent).toBeGreaterThanOrEqual(2)
    const [b] = await jobsFor(payload, `reminder-${buyerSeat!.id}-48`)
    const [g] = await jobsFor(payload, `reminder-${guestSeat!.id}-48`)
    expect(inputOf(b!)).toMatchObject({ template: "reminder", to: o.buyerEmail, locale: "fr", data: { hoursBefore: 48 } })
    expect(inputOf(g!)).toMatchObject({ template: "reminder", locale: "en", data: { hoursBefore: 48 } })
    expect(String(inputOf(b!).data.accountUrl)).toMatch(/\/fr\/connexion$/)
    expect(String(inputOf(g!).data.accountUrl)).toMatch(/\/en\/auth\/login$/)
    expect(inputOf(g!).ics?.[0]?.uid).toBe(`session-${o.session.id}@cookforfriends`)

    await scheduling.sendDueReminders(at(o.startsAt, 46))
    expect(await jobsFor(payload, `reminder-${buyerSeat!.id}-48`)).toHaveLength(1)
    expect(await deliveries(buyerSeat!.id)).toHaveLength(1)

    await scheduling.sendDueReminders(at(o.startsAt, 23))
    expect(await jobsFor(payload, `reminder-${buyerSeat!.id}-24`)).toHaveLength(1)
    expect(await deliveries(buyerSeat!.id)).toHaveLength(2)
    await scheduling.sendDueReminders(at(o.startsAt, 22))
    expect(await jobsFor(payload, `reminder-${buyerSeat!.id}-24`)).toHaveLength(1)
  })

  it("two overlapping runs → one reminder per (enrollment, offset)", async () => {
    const o = await order(2, 100)
    const now = at(o.startsAt, 47)
    await Promise.all([scheduling.sendDueReminders(now), scheduling.sendDueReminders(now)])
    for (const seat of o.seats) {
      expect(await deliveries(seat.id)).toHaveLength(1)
      expect(await jobsFor(payload, `reminder-${seat.id}-48`)).toHaveLength(1)
    }
  })

  it("cancelled seat is skipped", async () => {
    const o = await order(2, 100)
    const r = await commerce.executeSeatCancellation({ enrollmentId: o.seats[1]!.id, outcome: "none", amount: 0, by: "staff", actorId: 1, reason: "test" })
    expect(r.ok).toBe(true)
    await scheduling.sendDueReminders(at(o.startsAt, 47))
    expect(await deliveries(o.seats[1]!.id)).toHaveLength(0)
    expect(await jobsFor(payload, `reminder-${o.seats[1]!.id}-48`)).toHaveLength(0)
    expect(await jobsFor(payload, `reminder-${o.seats[0]!.id}-48`)).toHaveLength(1)
  })

  it("booked 30 h before the start → no 48 h reminder, only the 24 h one; booked 10 h before → none", async () => {
    const late = await order(1, 30)
    await scheduling.sendDueReminders(new Date())
    expect(await deliveries(late.seats[0]!.id)).toHaveLength(0)
    await scheduling.sendDueReminders(at(late.startsAt, 20))
    expect((await deliveries(late.seats[0]!.id)).map((d) => d.offsetHours)).toEqual([24])

    const last = await order(1, 10)
    await scheduling.sendDueReminders(new Date())
    await scheduling.sendDueReminders(at(last.startsAt, 5))
    expect(await deliveries(last.seats[0]!.id)).toHaveLength(0)
  })

  it("a failed enqueue rolls the delivery row back (no row, no job)", async () => {
    const o = await order(1, 100)
    hooks.failKey = `reminder-${o.seats[0]!.id}-48`
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    await scheduling.sendDueReminders(at(o.startsAt, 47))
    expect(hooks.failKey).toBeNull()
    expect(err).toHaveBeenCalled()
    expect(await deliveries(o.seats[0]!.id)).toHaveLength(0)
    err.mockRestore()
    await scheduling.sendDueReminders(at(o.startsAt, 46.5)) // next cron run recovers
    expect(await deliveries(o.seats[0]!.id)).toHaveLength(1)
    expect(await jobsFor(payload, `reminder-${o.seats[0]!.id}-48`)).toHaveLength(1)
  })

  describe("GET /api/cron/reminders", () => {
    it("200 { ok, sent } with the bearer", async () => {
      process.env.CRON_SECRET = "cron-secret-w305"
      const { GET } = await import("../../../app/api/cron/reminders/route")
      const res = await GET(new NextRequest("http://localhost:3000/api/cron/reminders", { headers: { authorization: "Bearer cron-secret-w305" } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(typeof body.sent).toBe("number")
    })
  })

  describe("POST /api/enrollments/:id/attendance", () => {
    const post = (body: unknown, origin?: string) =>
      new Request("http://localhost:3000/api/enrollments/1/attendance", {
        method: "POST",
        headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
        body: JSON.stringify(body),
      })
    const authAs = (user: unknown) => vi.spyOn(payload, "auth").mockResolvedValue({ user, permissions: {} } as never)
    const attendanceOf = async (id: number) => (await payload.findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true })).attendance

    it("staff → 200 and persisted; back to unknown works", async () => {
      const o = await order(2, 1)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      const res = await scheduling.handleAttendance(post({ attendance: "present" }), String(o.seats[1]!.id))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, data: { attendance: "present" } })
      expect(await attendanceOf(o.seats[1]!.id)).toBe("present")
      expect((await scheduling.handleAttendance(post({ attendance: "unknown" }), String(o.seats[1]!.id))).status).toBe(200)
      expect(await attendanceOf(o.seats[1]!.id)).toBe("unknown")
    })

    it("anonymous → 401; customer → 403; foreign origin → 403; bad body → 400; bad id → 404", async () => {
      const o = await order(1, 1)
      const id = String(o.seats[0]!.id)
      authAs(null)
      expect((await scheduling.handleAttendance(post({ attendance: "present" }), id)).status).toBe(401)
      authAs(asUser(await makeCustomer(payload), "customers"))
      expect((await scheduling.handleAttendance(post({ attendance: "present" }), id)).status).toBe(403)
      expect((await scheduling.handleAttendance(post({ attendance: "present" }, "https://evil.example"), id)).status).toBe(403)
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      expect((await scheduling.handleAttendance(post({ attendance: "maybe" }), id)).status).toBe(400)
      expect((await scheduling.handleAttendance(post({ attendance: "present" }), "nope")).status).toBe(404)
      expect(await attendanceOf(o.seats[0]!.id)).toBe("unknown")
    })

    it("cancelled seat → 409; unknown seat → 404", async () => {
      const o = await order(2, 1)
      await commerce.executeSeatCancellation({ enrollmentId: o.seats[1]!.id, outcome: "none", amount: 0, by: "staff", actorId: 1, reason: "test" })
      authAs(asUser(await makeStaff(payload, "staff"), "users"))
      expect((await scheduling.handleAttendance(post({ attendance: "present" }), String(o.seats[1]!.id))).status).toBe(409)
      expect((await scheduling.handleAttendance(post({ attendance: "present" }), "2000000000")).status).toBe(404)
    })

    it("markAttendance: non-staff id → FORBIDDEN", async () => {
      const o = await order(1, 1)
      const customer = await makeCustomer(payload)
      const r = await scheduling.markAttendance({ enrollmentId: o.seats[0]!.id, attendance: "present", staffId: customer.id })
      expect(!r.ok && r.error.code).toBe("FORBIDDEN")
    })
  })
})
