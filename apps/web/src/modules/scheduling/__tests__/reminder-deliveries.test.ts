import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeCustomer, makeSession, makeStaff } from "../../../../test/fixtures"
import { addConfirmedEnrollment } from "../../commerce/__tests__/helpers"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("scheduling reminder-deliveries (integration)", { timeout: 60_000 }, () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  async function makeEnrollment() {
    const course = await makeCourse(payload, "in_person")
    const session = await makeSession(payload, course.id, 4)
    return addConfirmedEnrollment(payload, session.id, course.id)
  }

  const create = (enrollment: number | string, offsetHours: number) =>
    payload.create({ collection: "reminder-deliveries", overrideAccess: true, data: { enrollment: enrollment as number, offsetHours, sentAt: new Date().toISOString() } })

  it("rejects a duplicate (enrollment, offsetHours); other offsets/enrollments are fine", async () => {
    const e = await makeEnrollment()
    await create(e.id, 24)
    await expect(create(e.id, 24)).rejects.toThrow()
    await expect(create(e.id, 48)).resolves.toBeTruthy()
    const e2 = await makeEnrollment()
    await expect(create(e2.id, 24)).resolves.toBeTruthy()
  })

  it("5 concurrent inserts of the same key → exactly one row", async () => {
    const e = await makeEnrollment()
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => create(e.id, 24)))
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rows = await payload.find({ collection: "reminder-deliveries", where: { enrollment: { equals: e.id } }, overrideAccess: true, pagination: false })
    expect(rows.totalDocs).toBe(1)
  })

  it("offsetHours must be an integer ≥ 1; sentAt defaults to now", async () => {
    const e = await makeEnrollment()
    await expect(create(e.id, 0)).rejects.toThrow()
    await expect(create(e.id, 1.5)).rejects.toThrow()
    const row = await payload.create({ collection: "reminder-deliveries", overrideAccess: true, data: { enrollment: e.id as number, offsetHours: 2 } as never })
    expect(new Date(row.sentAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it("customers and anonymous cannot read or write (REST-equivalent access); staff can read only", async () => {
    const e = await makeEnrollment()
    await create(e.id, 24)
    const customer = await makeCustomer(payload)
    const staff = await makeStaff(payload, "staff")
    const asCustomer = asUser(customer, "customers")
    const asStaff = asUser(staff, "users")

    await expect(payload.find({ collection: "reminder-deliveries", user: asCustomer, overrideAccess: false })).rejects.toThrow()
    await expect(payload.find({ collection: "reminder-deliveries", overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.create({ collection: "reminder-deliveries", user: asCustomer, overrideAccess: false, data: { enrollment: e.id as number, offsetHours: 5, sentAt: new Date().toISOString() } }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: "reminder-deliveries", user: asStaff, overrideAccess: false, data: { enrollment: e.id as number, offsetHours: 6, sentAt: new Date().toISOString() } }),
    ).rejects.toThrow()
    await expect(payload.find({ collection: "reminder-deliveries", user: asStaff, overrideAccess: false })).resolves.toBeTruthy()
  })
})
