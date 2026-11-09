import type { Payload } from "payload"
import { beforeAll, describe, expect, it } from "vitest"

import { makeCustomer } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb } from "../../../../test/integration"

describe.skipIf(!hasTestDb)("identity updateCustomerProfile (integration)", { timeout: 30_000 }, () => {
  let payload: Payload
  let identity: typeof import("../index")
  beforeAll(async () => {
    payload = await getTestPayload()
    identity = await import("../index")
  }, 60_000)

  it("updates editable fields, keeps email and sessionVersion", async () => {
    const c = await makeCustomer(payload)
    const before = await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })
    const res = await identity.updateCustomerProfile(c.id, {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "514-555-0100",
      preferredLocale: "en",
      marketingConsent: true,
      dietaryNotes: "no nuts",
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toMatchObject({
      email: c.email,
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "514-555-0100",
      preferredLocale: "en",
      marketingConsent: true,
    })
    const after = await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })
    expect(after.email).toBe(before.email)
    expect(after.sessionVersion).toBe(before.sessionVersion)
    expect(after.dietaryNotes).toBe("no nuts")
  })

  it("partial patch leaves other fields; null clears", async () => {
    const c = await makeCustomer(payload)
    await identity.updateCustomerProfile(c.id, { firstName: "Ada", phone: "1" })
    const res = await identity.updateCustomerProfile(c.id, { phone: null })
    expect(res.ok && res.data.firstName).toBe("Ada")
    expect(res.ok && res.data.phone).toBeNull()
  })

  it("invalid input → VALIDATION with paths, nothing written", async () => {
    const c = await makeCustomer(payload)
    const res = await identity.updateCustomerProfile(c.id, {
      firstName: "x".repeat(101),
      preferredLocale: "de" as never,
    })
    expect(res.ok).toBe(false)
    if (res.ok || res.error.code !== "VALIDATION") throw new Error("expected VALIDATION")
    expect(res.error.issues.map((i) => i.path).sort()).toEqual(["firstName", "preferredLocale"])
    const row = await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })
    expect(row.firstName ?? null).toBeNull()
  })

  it("email in the patch is rejected, not applied", async () => {
    const c = await makeCustomer(payload)
    const res = await identity.updateCustomerProfile(c.id, { email: "other@example.com" } as never)
    expect(res.ok).toBe(false)
    const row = await payload.findByID({ collection: "customers", id: c.id, overrideAccess: true })
    expect(row.email).toBe(c.email)
  })

  it("unknown customer → NOT_FOUND", async () => {
    const res = await identity.updateCustomerProfile(2_000_000_000, { firstName: "x" })
    expect(res).toEqual({ ok: false, error: { code: "NOT_FOUND", entity: "customer" } })
  })
})
