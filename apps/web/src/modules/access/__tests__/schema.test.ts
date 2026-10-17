import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCourse, makeCustomer, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("access schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("UNIQUE (customer, course, source, sourceRef)", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const data = { customer: c.id, course: course.id, source: "purchase" as const, sourceRef: `ord-${uid()}`, validFrom: new Date().toISOString() }
    await payload.create({ collection: "entitlements", data })
    await expect(payload.create({ collection: "entitlements", data })).rejects.toThrow()
    // A different sourceRef is a different grant.
    await expect(
      payload.create({ collection: "entitlements", data: { ...data, sourceRef: `ord-${uid()}` } }),
    ).resolves.toBeTruthy()
  })

  it("anonymous cannot read entitlements; a customer reads only their own", async () => {
    const a = await makeCustomer(payload)
    const b = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    await payload.create({
      collection: "entitlements",
      data: { customer: a.id, course: course.id, source: "manual", sourceRef: `u-${uid()}`, validFrom: new Date().toISOString() },
    })
    await payload.create({
      collection: "entitlements",
      data: { customer: b.id, course: course.id, source: "manual", sourceRef: `u-${uid()}`, validFrom: new Date().toISOString() },
    })
    await expect(payload.find({ collection: "entitlements", overrideAccess: false })).rejects.toThrow()
    const own = await payload.find({
      collection: "entitlements",
      overrideAccess: false,
      user: asUser(a, "customers"),
      depth: 0,
    })
    expect(own.docs.length).toBe(1)
    expect(own.docs[0]?.customer).toBe(a.id)
  })

  it("staff may create only manual entitlements", async () => {
    const staff = asUser(await makeStaff(payload, "staff"), "users")
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    await expect(
      payload.create({
        collection: "entitlements",
        overrideAccess: false,
        user: staff,
        data: { customer: c.id, course: course.id, source: "manual", sourceRef: String(staff.id), validFrom: new Date().toISOString() },
      }),
    ).resolves.toBeTruthy()
    await expect(
      payload.create({
        collection: "entitlements",
        overrideAccess: false,
        user: staff,
        data: { customer: c.id, course: course.id, source: "purchase", sourceRef: `ord-${uid()}`, validFrom: new Date().toISOString() },
      }),
    ).rejects.toThrow()
  })
})
