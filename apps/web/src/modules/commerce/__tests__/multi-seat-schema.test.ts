import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeCustomer, makeOrder, makeSession } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { validateMaxSeats } from "../../catalog/globals/site-settings"

describe("validateMaxSeats (unit)", () => {
  it("accepts 1..10 integers and empty", () => {
    for (const v of [1, 4, 10, null, undefined]) expect(validateMaxSeats(v)).toBe(true)
  })
  it("rejects 0, 11, 2.5", () => {
    for (const v of [0, 11, 2.5]) expect(validateMaxSeats(v)).not.toBe(true)
  })
})

describe.skipIf(!hasTestDb)("multi-seat schema (integration, CCR-W2-6)", { timeout: 30_000 }, () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  async function hold(attendees: { firstName: string; lastName: string; email: string }[]) {
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    return payload.create({
      collection: "seat-holds",
      data: {
        session: session.id,
        quantity: attendees.length + 1,
        cartToken: `cart_${uid()}`,
        customerEmail: "buyer@example.com",
        status: "active",
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        attendees,
      },
    })
  }

  const guest = (i: number) => ({ firstName: `G${i}`, lastName: "Guest", email: `g${i}-${uid()}@example.com` })

  it("seat-holds.attendees round-trips in order", async () => {
    const created = await hold([guest(1), guest(2), guest(3)])
    const read = await payload.findByID({ collection: "seat-holds", id: created.id, depth: 0 })
    expect(read.attendees?.map((a) => a.firstName)).toEqual(["G1", "G2", "G3"])
    expect(read.attendees?.[0]?.email).toMatch(/@example\.com$/)
  })

  it("seat-holds.attendees accepts 9 rows and rejects 10 (maxRows)", async () => {
    const nine = await hold(Array.from({ length: 9 }, (_, i) => guest(i)))
    expect(nine.attendees).toHaveLength(9)
    await expect(hold(Array.from({ length: 10 }, (_, i) => guest(i)))).rejects.toThrow()
  })

  it("seat-holds.attendees requires firstName, lastName and a valid email", async () => {
    await expect(hold([{ firstName: "", lastName: "X", email: "a@example.com" }])).rejects.toThrow()
    await expect(hold([{ firstName: "A", lastName: "", email: "a@example.com" }])).rejects.toThrow()
    await expect(hold([{ firstName: "A", lastName: "X", email: "not-an-email" }])).rejects.toThrow()
    await expect(hold([{ firstName: "x".repeat(101), lastName: "X", email: "a@example.com" }])).rejects.toThrow()
  })

  it("enrollments.seatAmount stores cents; negative and fractional are rejected", async () => {
    const cust = await makeCustomer(payload)
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    const order = await makeOrder(payload, cust.id, course.id)
    const data = { order: order.id, session: session.id, customer: cust.id, status: "confirmed" as const, attendance: "unknown" as const }
    const ok = await payload.create({ collection: "enrollments", data: { ...data, attendeeIndex: 0, seatAmount: 2501 } })
    const read = await payload.findByID({ collection: "enrollments", id: ok.id, depth: 0 })
    expect(read.seatAmount).toBe(2501)
    await expect(
      payload.create({ collection: "enrollments", data: { ...data, attendeeIndex: 1, seatAmount: -1 } }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: "enrollments", data: { ...data, attendeeIndex: 2, seatAmount: 10.5 } }),
    ).rejects.toThrow()
    // optional
    await expect(
      payload.create({ collection: "enrollments", data: { ...data, attendeeIndex: 3 } }),
    ).resolves.toBeTruthy()
  })

  it("orders.refunds[].enrollment links to an enrollment", async () => {
    const cust = await makeCustomer(payload)
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    const order = await makeOrder(payload, cust.id, course.id)
    const enr = await payload.create({
      collection: "enrollments",
      data: { order: order.id, session: session.id, customer: cust.id, attendeeIndex: 0, status: "confirmed", attendance: "unknown" },
    })
    await payload.update({
      collection: "orders",
      id: order.id,
      overrideAccess: true,
      data: { refunds: [{ stripeRefundId: `re_${uid()}`, amount: 500, at: new Date().toISOString(), enrollment: enr.id }] },
    })
    const read = await payload.findByID({ collection: "orders", id: order.id, depth: 0 })
    expect(read.refunds?.[0]?.enrollment).toBe(enr.id)
  })

  describe("site-settings.maxSeatsPerPurchase", () => {
    it("rejects 0, 11 and 2.5; accepts 10; restores", async () => {
      const before = await payload.findGlobal({ slug: "site-settings", depth: 0 })
      try {
        for (const bad of [0, 11, 2.5]) {
          await expect(
            payload.updateGlobal({ slug: "site-settings", data: { maxSeatsPerPurchase: bad }, overrideAccess: true }),
          ).rejects.toThrow()
        }
        const ok = await payload.updateGlobal({ slug: "site-settings", data: { maxSeatsPerPurchase: 10 }, overrideAccess: true })
        expect(ok.maxSeatsPerPurchase).toBe(10)
      } finally {
        await payload.updateGlobal({
          slug: "site-settings",
          data: { maxSeatsPerPurchase: before.maxSeatsPerPurchase ?? 4 },
          overrideAccess: true,
        })
      }
    })
  })
})
