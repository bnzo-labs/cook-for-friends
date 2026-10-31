import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * createCheckout paths that end before the locked allocation (no DB):
 * catalog is replaced per test so staff settings can be varied without
 * touching the shared site-settings global other suites read.
 */
const catalog = vi.hoisted(() => ({
  getCourseCommerceRecord: vi.fn(),
  getSiteSettings: vi.fn(),
  getSessionView: vi.fn(),
}))
vi.mock("@/modules/catalog", () => catalog)

const holds = vi.hoisted(() => ({ allocateHold: vi.fn() }))
vi.mock("../server/holds", async (orig) => ({ ...(await orig<typeof import("../server/holds")>()), ...holds }))

import { createCheckout } from "../server/checkout"
import { newCartToken } from "../server/http"

const course = (over: Record<string, unknown> = {}) => ({
  id: 1,
  format: "in_person",
  status: "published",
  price: 5000,
  stripePriceId: "price_x",
  ...over,
})
const future = new Date(Date.now() + 7 * 86_400_000).toISOString()
const guests = (n: number) => Array.from({ length: n }, (_, i) => ({ firstName: "G", lastName: `${i}`, email: `g${i}@example.com` }))

describe("createCheckout — pre-lock validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    catalog.getCourseCommerceRecord.mockResolvedValue(course())
    catalog.getSiteSettings.mockResolvedValue({ maxSeatsPerPurchase: 4, holdMinutes: 15 })
    catalog.getSessionView.mockResolvedValue({ id: 2, courseId: 1, status: "scheduled", startsAt: future })
  })

  const call = (line: Record<string, unknown>, email?: string, cartToken = newCartToken()) =>
    createCheckout({ cart: [{ courseId: 1, sessionId: 2, quantity: 1, ...line }], locale: "fr", customerEmail: email, cartToken })

  it("settings max 2 → quantity 3 rejected before any lock", async () => {
    catalog.getSiteSettings.mockResolvedValue({ maxSeatsPerPurchase: 2, holdMinutes: 15 })
    const r = await call({ quantity: 3, attendees: guests(2) }, "b@example.com")
    expect(r).toEqual({
      ok: false,
      error: { code: "VALIDATION", issues: [{ path: "lines.0.quantity", message: "errors.QUANTITY_OUT_OF_RANGE" }] },
    })
    expect(holds.allocateHold).not.toHaveBeenCalled()
  })

  it.each([
    ["draft", course({ status: "draft" })],
    ["no Stripe price", course({ stripePriceId: null })],
    ["unknown course", null],
  ])("course %s → CONFLICT COURSE_NOT_PURCHASABLE", async (_label, rec) => {
    catalog.getCourseCommerceRecord.mockResolvedValue(rec)
    expect(await call({})).toEqual({ ok: false, error: { code: "CONFLICT", reason: "COURSE_NOT_PURCHASABLE" } })
    expect(holds.allocateHold).not.toHaveBeenCalled()
  })

  it("session of another course / unknown → VALIDATION lines.0.sessionId", async () => {
    catalog.getSessionView.mockResolvedValue({ id: 2, courseId: 999, status: "scheduled", startsAt: future })
    const r = await call({})
    expect(!r.ok && r.error).toEqual({ code: "VALIDATION", issues: [{ path: "lines.0.sessionId", message: "errors.SESSION_INVALID" }] })
    catalog.getSessionView.mockResolvedValue(null)
    expect((await call({})).ok).toBe(false)
    expect(holds.allocateHold).not.toHaveBeenCalled()
  })

  it.each([
    ["cancelled", { status: "cancelled", startsAt: future }],
    ["past", { status: "scheduled", startsAt: new Date(Date.now() - 60_000).toISOString() }],
  ])("%s session → CONFLICT SESSION_NOT_BOOKABLE", async (_l, s) => {
    catalog.getSessionView.mockResolvedValue({ id: 2, courseId: 1, ...s })
    expect(await call({})).toEqual({ ok: false, error: { code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" } })
    expect(holds.allocateHold).not.toHaveBeenCalled()
  })

  it("invalid cart token → VALIDATION cartToken", async () => {
    const r = await call({}, undefined, "short")
    expect(!r.ok && r.error.code).toBe("VALIDATION")
    expect(catalog.getCourseCommerceRecord).not.toHaveBeenCalled()
  })

  it("shape errors never reach the catalog", async () => {
    const r = await createCheckout({ cart: [], locale: "fr", cartToken: newCartToken() })
    expect(!r.ok && r.error.code).toBe("VALIDATION")
    expect(catalog.getCourseCommerceRecord).not.toHaveBeenCalled()
  })

  it("SOLD_OUT from the allocation is returned as is", async () => {
    holds.allocateHold.mockResolvedValue({ ok: false, error: { code: "SOLD_OUT", sessionId: 2 } })
    expect(await call({})).toEqual({ ok: false, error: { code: "SOLD_OUT", sessionId: 2 } })
    expect(holds.allocateHold).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 2, quantity: 1, holdMinutes: 15, customerEmail: null, attendees: [] }),
    )
  })

  it("online course: allocation without a session", async () => {
    catalog.getCourseCommerceRecord.mockResolvedValue(course({ format: "online" }))
    holds.allocateHold.mockResolvedValue({ ok: false, error: { code: "CONFLICT", reason: "X" } })
    await createCheckout({ cart: [{ courseId: 1, quantity: 1 }], locale: "en", cartToken: newCartToken() })
    expect(holds.allocateHold).toHaveBeenCalledWith(expect.objectContaining({ sessionId: undefined }))
    expect(catalog.getSessionView).not.toHaveBeenCalled()
  })
})
