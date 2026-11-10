/** W3-01b cancel slot mapping (pure: scheduling/catalog/payload mocked). */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SeatRow } from "../data"

const preview = vi.fn()
const findByID = vi.fn()

vi.mock("@/modules/scheduling", () => ({ previewCancellation: (i: unknown) => preview(i) }))
vi.mock("@/modules/catalog", () => ({
  getSiteSettings: async () => ({ contactEmail: "hi@example.com", legal: { cancellationPageId: 7 } }),
}))
vi.mock("@/lib/payload", () => ({ getPayload: async () => ({ findByID }) }))

import { loadCancelContext } from "../sessions/cancel-data"

const seat = (over: Partial<SeatRow>): SeatRow => ({
  enrollmentId: 1,
  orderNumber: "CFF-1",
  courseTitle: "Pain",
  startsAt: "2030-01-01T15:00:00.000Z",
  endsAt: "2030-01-01T18:00:00.000Z",
  locationName: null,
  status: "confirmed",
  attendance: "unknown",
  isGuestSeat: false,
  guestName: null,
  bookedByMe: true,
  buyerCustomerId: 10,
  upcoming: true,
  ...over,
})

beforeEach(() => {
  preview.mockReset()
  findByID.mockReset()
  findByID.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === "pages" ? { slug: "annulation", _status: "published" } : { firstName: "Bea" },
  )
})

describe("loadCancelContext", () => {
  it("maps an allowed preview and resolves the policy link", async () => {
    preview.mockResolvedValue({ ok: true, data: { allowed: true, outcome: "refund", percent: 100, amount: 5000, hoursBefore: 96, deadlineNextTier: "2029-12-29T15:00:00.000Z" } })
    const ctx = await loadCancelContext(10, "fr", [seat({})])
    expect(preview).toHaveBeenCalledWith({ enrollmentId: 1, actorCustomerId: 10 })
    expect(ctx.byEnrollment["1"]).toEqual({
      kind: "allowed",
      preview: { outcome: "refund", amount: 5000, percent: 100, hoursBefore: 96, deadlineNextTier: "2029-12-29T15:00:00.000Z" },
    })
    expect(ctx.policyHref).toBe("/fr/annulation")
    expect(ctx.contactEmail).toBe("hi@example.com")
  })

  it("guest seat: blocked NOT_BUYER carries the buyer first name only", async () => {
    preview.mockResolvedValue({ ok: true, data: { allowed: false, reason: "NOT_BUYER", outcome: "refund", percent: 100, amount: 5000, hoursBefore: 96 } })
    const ctx = await loadCancelContext(11, "en", [seat({ bookedByMe: false, buyerCustomerId: 10 })])
    expect(ctx.byEnrollment["1"]).toEqual({ kind: "blocked", reason: "NOT_BUYER", buyerFirstName: "Bea" })
  })

  it("skips cancelled and past rows; hides the policy link for an unpublished page", async () => {
    findByID.mockImplementation(async ({ collection }: { collection: string }) => (collection === "pages" ? { slug: "x", _status: "draft" } : null))
    const ctx = await loadCancelContext(10, "en", [seat({ status: "cancelled" }), seat({ enrollmentId: 2, upcoming: false })])
    expect(preview).not.toHaveBeenCalled()
    expect(ctx.byEnrollment).toEqual({})
    expect(ctx.policyHref).toBeNull()
  })

  it("preview failure never offers a button", async () => {
    preview.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", entity: "enrollment" } })
    const ctx = await loadCancelContext(10, "en", [seat({})])
    expect(ctx.byEnrollment["1"]?.kind).toBe("blocked")
  })
})
