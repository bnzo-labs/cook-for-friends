import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeCustomer, makeOrder, makeSession, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("commerce schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("UNIQUE (order, session, attendeeIndex) on enrollments", async () => {
    const cust = await makeCustomer(payload)
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    const order = await makeOrder(payload, cust.id, course.id)
    const data = { order: order.id, session: session.id, customer: cust.id, attendeeIndex: 0, status: "confirmed" as const, attendance: "unknown" as const }
    await payload.create({ collection: "enrollments", data })
    await expect(payload.create({ collection: "enrollments", data })).rejects.toThrow()
    await expect(
      payload.create({ collection: "enrollments", data: { ...data, attendeeIndex: 1 } }),
    ).resolves.toBeTruthy()
  })

  it("orders.stripeCheckoutSessionId and orders.number are unique", async () => {
    const cust = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const order = await makeOrder(payload, cust.id, course.id)
    const base = {
      email: "dup@example.com",
      locale: "fr" as const,
      status: "pending" as const,
      subtotal: 100,
      discountTotal: 0,
      taxGst: 0,
      taxQst: 0,
      total: 100,
      currency: "cad" as const,
      items: [{ course: course.id, quantity: 1, unitAmount: 100 }],
    }
    await expect(
      payload.create({
        collection: "orders",
        data: { ...base, number: `CFF-${uid()}`, stripeCheckoutSessionId: order.stripeCheckoutSessionId },
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: "orders",
        data: { ...base, number: order.number, stripeCheckoutSessionId: `cs_test_${uid()}` },
      }),
    ).rejects.toThrow()
  })

  it("processed-stripe-events.eventId is unique", async () => {
    const data = { eventId: `evt_${uid()}`, type: "checkout.session.completed", processedAt: new Date().toISOString(), outcome: "applied" as const }
    await payload.create({ collection: "processed-stripe-events", data })
    await expect(payload.create({ collection: "processed-stripe-events", data })).rejects.toThrow()
  })

  it("discount-codes.code is unique", async () => {
    const code = `CODE${uid()}`.toUpperCase()
    await payload.create({ collection: "discount-codes", data: { code, kind: "amount" as const, value: 500 } })
    await expect(
      payload.create({ collection: "discount-codes", data: { code, kind: "amount" as const, value: 500 } }),
    ).rejects.toThrow()
  })

  it("a customer cannot read another customer's order", async () => {
    const a = await makeCustomer(payload)
    const b = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const orderA = await makeOrder(payload, a.id, course.id)
    const orderB = await makeOrder(payload, b.id, course.id)
    const userA = asUser(a, "customers")
    await expect(
      payload.findByID({ collection: "orders", id: orderB.id, overrideAccess: false, user: userA }),
    ).rejects.toThrow()
    const list = await payload.find({ collection: "orders", overrideAccess: false, user: userA, depth: 0 })
    expect(list.docs.map((d) => d.id)).toEqual([orderA.id])
    await expect(payload.find({ collection: "orders", overrideAccess: false })).rejects.toThrow()
  })

  it("staff can update attendance but not other enrollment fields", async () => {
    const staff = asUser(await makeStaff(payload, "staff"), "users")
    const cust = await makeCustomer(payload)
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    const order = await makeOrder(payload, cust.id, course.id)
    const e = await payload.create({
      collection: "enrollments",
      data: { order: order.id, session: session.id, customer: cust.id, attendeeIndex: 0, status: "confirmed" as const, attendance: "unknown" as const },
    })
    const updated = await payload.update({
      collection: "enrollments",
      id: e.id,
      overrideAccess: false,
      user: staff,
      data: { attendance: "present", status: "refunded" },
    })
    expect(updated.attendance).toBe("present")
    expect(updated.status).toBe("confirmed")
  })

  it("seat-holds are not writable through access-checked APIs", async () => {
    const staff = asUser(await makeStaff(payload, "admin"), "users")
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id)
    await expect(
      payload.create({
        collection: "seat-holds",
        overrideAccess: false,
        user: staff,
        data: { session: session.id, quantity: 1, cartToken: uid(), status: "active", expiresAt: new Date().toISOString() },
      }),
    ).rejects.toThrow()
  })
})
