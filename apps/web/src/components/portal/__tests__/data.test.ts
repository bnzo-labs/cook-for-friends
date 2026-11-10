/**
 * W3-01 data correctness (integration, real Postgres via TEST_DATABASE_URL):
 * what each customer sees in the portal loaders.
 */
import type { Payload } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb } from "../../../../test/integration"
import { grantCourse, seedPortalWorld, type PortalWorld } from "../../../../test/portal-fixtures"
import { loadOrders, loadOwnedCourses, loadSeats } from "../data"

describe.skipIf(!hasTestDb)("portal data loaders (integration)", () => {
  let payload: Payload
  let w: PortalWorld
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    w = await seedPortalWorld(payload)
  }, 120_000)

  it("buyer of a 3-seat order sees 3 seat rows, 2 badged as guest seats", async () => {
    const { upcoming, past } = await loadSeats(w.buyer.id, "en")
    const mine = upcoming.filter((s) => s.orderNumber === w.seatsOrder.number)
    expect(mine).toHaveLength(3)
    expect(past).toHaveLength(0)
    expect(mine.filter((s) => s.isGuestSeat).map((s) => s.guestName).sort()).toEqual(["Gia Guest", "Gus Guest"])
    expect(mine.filter((s) => !s.isGuestSeat)).toHaveLength(1)
    expect(mine.every((s) => s.status === "confirmed" && s.bookedByMe)).toBe(true)
  })

  it("a guest sees only their own seat, no guest badge", async () => {
    const { upcoming } = await loadSeats(w.guest1.id, "fr")
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]).toMatchObject({ isGuestSeat: false, bookedByMe: false, status: "confirmed" })
    expect(upcoming[0]!.courseTitle).toBeTruthy()
  })

  it("customer with 1 online entitlement sees exactly that course; revoked one is gone", async () => {
    const cards = await loadOwnedCourses(w.buyer.id, "fr")
    expect(cards.map((c) => String(c.id))).toEqual([String(w.online.id)])
    expect(cards.map((c) => String(c.id))).not.toContain(String(w.onlineRevoked.id))
    expect(cards.map((c) => String(c.id))).not.toContain(String(w.onlineOther.id))
  })

  it("revoking an entitlement removes the card", async () => {
    const extra = await grantCourse(payload, w.empty.id, w.onlineOther.id)
    expect((await loadOwnedCourses(w.empty.id, "en")).map((c) => String(c.id))).toEqual([String(w.onlineOther.id)])
    await payload.update({
      collection: "entitlements",
      id: extra.id,
      data: { revokedAt: new Date().toISOString(), revokedReason: "test" },
      overrideAccess: true,
    })
    expect(await loadOwnedCourses(w.empty.id, "en")).toEqual([])
  })

  it("orders newest first; receipt link only when hasReceipt", async () => {
    const orders = await loadOrders(w.buyer.id)
    expect(orders.map((o) => o.number)).toEqual([w.onlineOrder.number, w.seatsOrder.number])
    expect(orders.map((o) => o.hasReceipt)).toEqual([false, true])
  })

  it("customer with nothing gets empty lists", async () => {
    const fresh = await payload.create({
      collection: "customers",
      data: { email: `nobody-${Date.now()}@example.com`, preferredLocale: "fr" },
      overrideAccess: true,
    })
    expect(await loadSeats(fresh.id, "fr")).toEqual({ upcoming: [], past: [] })
    expect(await loadOwnedCourses(fresh.id, "fr")).toEqual([])
    expect(await loadOrders(fresh.id)).toEqual([])
  })
})
