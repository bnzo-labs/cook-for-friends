import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { makeCourse, makeCustomer } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { isActiveAt } from "../server/entitlements"

describe("isActiveAt (boundaries)", () => {
  const from = "2026-01-01T00:00:00.000Z"
  const until = "2026-02-01T00:00:00.000Z"
  const at = (iso: string) => new Date(iso)
  it("validFrom is inclusive", () => {
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at(from))).toBe(true)
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at("2025-12-31T23:59:59.999Z"))).toBe(false)
  })
  it("validUntil is exclusive; null = no expiry", () => {
    expect(isActiveAt({ validFrom: from, validUntil: until, revokedAt: null }, at("2026-01-31T23:59:59.999Z"))).toBe(true)
    expect(isActiveAt({ validFrom: from, validUntil: until, revokedAt: null }, at(until))).toBe(false)
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at("2099-01-01T00:00:00Z"))).toBe(true)
  })
  it("revoked is never active", () => {
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: from }, at("2026-01-02T00:00:00Z"))).toBe(false)
  })
})

describe.skipIf(!hasTestDb)("access entitlements (integration)", () => {
  let payload: Payload
  let access: typeof import("../index")
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    access = await import("../index")
  }, 60_000)

  const count = async (customer: number | string, course: number | string, sourceRef: string) =>
    (
      await payload.count({
        collection: "entitlements",
        where: { and: [{ customer: { equals: customer } }, { course: { equals: course } }, { sourceRef: { equals: sourceRef } }] },
        overrideAccess: true,
      })
    ).totalDocs

  it("grant -> hasActive / list; respects `at`", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const from = new Date(Date.now() - 1000)
    const until = new Date(Date.now() + 60_000)
    const r = await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, validFrom: from, validUntil: until })
    expect(r.ok).toBe(true)
    expect(await access.hasActiveEntitlement(c.id, course.id)).toBe(true)
    expect(await access.hasActiveEntitlement(c.id, course.id, new Date(from.getTime() - 1))).toBe(false)
    expect(await access.hasActiveEntitlement(c.id, course.id, until)).toBe(false)
    const list = await access.listActiveEntitlements(c.id)
    expect(list.map((e) => e.courseId)).toEqual([course.id])
  })

  it("idempotent: sequential and concurrent x5 -> one row, same id", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const input = { customerId: c.id, courseId: course.id, source: "purchase" as const, sourceRef: ref }
    const a = await access.grantEntitlement(input)
    const b = await access.grantEntitlement(input)
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true)

    const c2 = await makeCustomer(payload)
    const par = await Promise.all(Array.from({ length: 5 }, () => access.grantEntitlement({ ...input, customerId: c2.id })))
    expect(par.every((r) => r.ok)).toBe(true)
    expect(new Set(par.map((r) => (r.ok ? r.data.id : null))).size).toBe(1)
    expect(await count(c2.id, course.id, ref)).toBe(1)
  })

  it("revoked row is returned as-is, not un-revoked", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const i = { customerId: c.id, courseId: course.id, source: "manual" as const, sourceRef: `u-${uid()}` }
    await access.grantEntitlement(i)
    expect((await access.revokeEntitlement({ ...i, reason: "refund" })).ok).toBe(true)
    const again = await access.grantEntitlement(i)
    expect(again.ok && again.data.revokedAt).toBeTruthy()
    expect(await access.hasActiveEntitlement(c.id, course.id)).toBe(false)
  })

  it("multi-seat: one order, three customers -> three rows; revoking one leaves two", async () => {
    const course = await makeCourse(payload, "in_person")
    const ref = `ord-${uid()}`
    const customers = await Promise.all([makeCustomer(payload), makeCustomer(payload), makeCustomer(payload)])
    const res = await Promise.all(
      customers.map((c) => access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref })),
    )
    expect(res.every((r) => r.ok)).toBe(true)
    const { totalDocs } = await payload.count({
      collection: "entitlements",
      where: { and: [{ course: { equals: course.id } }, { sourceRef: { equals: ref } }] },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(3)
    const rev = await access.revokeEntitlement({ customerId: customers[0].id, courseId: course.id, source: "purchase", sourceRef: ref, reason: "seat cancelled" })
    expect(rev.ok).toBe(true)
    expect(await access.hasActiveEntitlement(customers[0].id, course.id)).toBe(false)
    expect(await access.hasActiveEntitlement(customers[1].id, course.id)).toBe(true)
    expect(await access.hasActiveEntitlement(customers[2].id, course.id)).toBe(true)
  })

  it("revoke: sets reason + revokedAt, idempotent, missing -> NOT_FOUND", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const i = { customerId: c.id, courseId: course.id, source: "gift" as const, sourceRef: `g-${uid()}` }
    expect(await access.revokeEntitlement({ ...i, reason: "x" })).toEqual({ ok: false, error: { code: "NOT_FOUND", entity: "entitlement" } })
    await access.grantEntitlement(i)
    expect((await access.revokeEntitlement({ ...i, reason: "first" })).ok).toBe(true)
    expect((await access.revokeEntitlement({ ...i, reason: "second" })).ok).toBe(true)
    const { docs } = await payload.find({ collection: "entitlements", where: { sourceRef: { equals: i.sourceRef } }, overrideAccess: true })
    expect(docs[0]?.revokedReason).toBe("first")
    expect(docs[0]?.revokedAt).toBeTruthy()
  })

  it("tx: grant joins the caller's transaction; rollback leaves no row", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, killTransaction } = await import("payload")
    await initTransaction(req)
    try {
      const r = await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, tx: { req } })
      expect(r.ok).toBe(true)
      expect(await count(c.id, course.id, ref)).toBe(0) // not visible outside the tx
    } finally {
      await killTransaction(req)
    }
    expect(await count(c.id, course.id, ref)).toBe(0)
  })

  it("tx: commit persists", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, commitTransaction } = await import("payload")
    await initTransaction(req)
    await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, tx: { req } })
    await commitTransaction(req)
    expect(await count(c.id, course.id, ref)).toBe(1)
  })
})
