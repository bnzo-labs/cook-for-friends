import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb } from "../../../../test/integration"
import { addConfirmedEnrollment, addHold, makeBookableSession } from "./helpers"

describe.skipIf(!hasTestDb)("getAvailableSeats (F2, integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    commerce = await import("../index")
  }, 60_000)

  it("empty session → capacity", async () => {
    const { session } = await makeBookableSession(payload, 5)
    expect(await commerce.getAvailableSeats(session.id)).toBe(5)
  })

  it("one live hold with quantity 3 on capacity 5 → 2 (Σ quantity, not rows)", async () => {
    const { session } = await makeBookableSession(payload, 5)
    await addHold(payload, session.id, { quantity: 3 })
    expect(await commerce.getAvailableSeats(session.id)).toBe(2)
  })

  it("active hold whose expiresAt is 1 s in the past does not count (no cron)", async () => {
    const { session } = await makeBookableSession(payload, 2)
    await addHold(payload, session.id, { quantity: 2, expiresAt: new Date(Date.now() - 1000) })
    expect(await commerce.getAvailableSeats(session.id)).toBe(2)
  })

  it("non-active holds never count", async () => {
    const { session } = await makeBookableSession(payload, 4)
    for (const status of ["converted", "expired", "released"] as const) await addHold(payload, session.id, { quantity: 1, status })
    expect(await commerce.getAvailableSeats(session.id)).toBe(4)
  })

  it("capacity 3 with 1 confirmed enrollment + 1 live hold → 1", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    await addConfirmedEnrollment(payload, session.id, course.id)
    await addHold(payload, session.id, { quantity: 1 })
    expect(await commerce.getAvailableSeats(session.id)).toBe(1)
  })

  it("cancelled/refunded enrollments free their seat; never negative; unknown session → 0", async () => {
    const { course, session } = await makeBookableSession(payload, 1)
    const e = await addConfirmedEnrollment(payload, session.id, course.id)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
    await addHold(payload, session.id, { quantity: 2 })
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
    await payload.update({ collection: "enrollments", id: e.id, data: { status: "refunded" }, overrideAccess: true })
    expect(await commerce.getAvailableSeats(session.id)).toBe(0) // hold of 2 still > capacity 1
    expect(await commerce.getAvailableSeats(2_000_000_000)).toBe(0)
    expect(await commerce.getAvailableSeats("abc")).toBe(0)
  })

  it("tx: reads inside the caller's transaction", async () => {
    const { session } = await makeBookableSession(payload, 3)
    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, killTransaction } = await import("payload")
    await initTransaction(req)
    try {
      await payload.create({
        collection: "seat-holds",
        data: { session: session.id, quantity: 2, cartToken: "tx-test-cart-token-0001", status: "active", expiresAt: new Date(Date.now() + 600_000).toISOString() },
        overrideAccess: true,
        req,
      })
      expect(await commerce.getAvailableSeats(session.id, { req })).toBe(1)
      expect(await commerce.getAvailableSeats(session.id)).toBe(3)
    } finally {
      await killTransaction(req)
    }
  })
})
