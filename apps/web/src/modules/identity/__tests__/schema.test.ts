import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCustomer, makeStaff } from "../../../../test/fixtures"
import { asUser, getTestPayload, hasTestDb, uid } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("identity schema (integration)", () => {
  let payload: Payload
  beforeAll(async () => {
    payload = await getTestPayload()
  }, 60_000)

  it("customers.email is unique", async () => {
    const email = `dup-${uid()}@example.com`
    const data = { email, preferredLocale: "fr" as const }
    await payload.create({ collection: "customers", data })
    await expect(payload.create({ collection: "customers", data })).rejects.toThrow()
  })

  it("a customer reads only their own customer record", async () => {
    const a = await makeCustomer(payload)
    const b = await makeCustomer(payload)
    const res = await payload.find({
      collection: "customers",
      overrideAccess: false,
      user: asUser(a, "customers"),
      limit: 100,
    })
    expect(res.docs.map((d) => d.id)).toEqual([a.id])
    await expect(
      payload.findByID({ collection: "customers", id: b.id, overrideAccess: false, user: asUser(a, "customers") }),
    ).rejects.toThrow()
  })

  it("anonymous cannot read customers or users", async () => {
    await expect(payload.find({ collection: "customers", overrideAccess: false })).rejects.toThrow()
    await expect(payload.find({ collection: "users", overrideAccess: false })).rejects.toThrow()
  })

  it("staff read only themselves in users; admin reads all", async () => {
    const staff = await makeStaff(payload, "staff")
    const admin = await makeStaff(payload, "admin")
    const asStaff = await payload.find({ collection: "users", overrideAccess: false, user: asUser(staff, "users"), limit: 100 })
    expect(asStaff.docs.map((d) => d.id)).toEqual([staff.id])
    const asAdmin = await payload.find({ collection: "users", overrideAccess: false, user: asUser(admin, "users"), limit: 100 })
    expect(asAdmin.totalDocs).toBeGreaterThanOrEqual(2)
  })

  it("magic-link-tokens.tokenHash is unique", async () => {
    const c = await makeCustomer(payload)
    const data = {
      customer: c.id,
      tokenHash: `h-${uid()}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      requestIp: "127.0.0.1",
    }
    await payload.create({ collection: "magic-link-tokens", data })
    await expect(payload.create({ collection: "magic-link-tokens", data })).rejects.toThrow()
  })
})
