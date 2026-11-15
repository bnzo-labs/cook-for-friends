import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * W4-03b (W3-10 L-9): POST /api/enrollments/:id/cancel is limited per actor
 * (20/h) so cancel retries cannot drive unbounded Stripe `refunds.list` calls.
 * Unit: identity, commerce reads, payload auth and the cancel service mocked.
 */
const consumeRateLimit = vi.fn()
const cancelEnrollment = vi.fn()

vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
  getCurrentCustomer: vi.fn(async () => ({ id: 9 })),
}))
vi.mock("@/modules/commerce", () => ({
  getEnrollmentView: vi.fn(async () => ({ id: 1 })),
  moduleErrorResponse: vi.fn(() => ({ status: 409, body: { ok: false } })),
}))
vi.mock("../server/payload", () => ({ getPayload: vi.fn(async () => ({ auth: async () => ({ user: null }) })) }))
vi.mock("../server/cancel", () => ({ cancelEnrollment: (...a: unknown[]) => cancelEnrollment(...a) }))

const { handleCancel } = await import("../server/http")

const req = () =>
  new Request("http://localhost:3000/api/enrollments/1/cancel", { method: "POST", headers: { origin: "http://localhost:3000" } })

describe("W3-10 L-9 cancel route rate limit (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    cancelEnrollment.mockResolvedValue({ ok: true, data: { outcome: "refund", amount: 100 } })
  })

  it("counts per customer (20/h) before the cancel service runs", async () => {
    expect((await handleCancel(req(), "1")).status).toBe(200)
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "scheduling-cancel", key: "customer:9", limit: 20, windowSeconds: 3600 }),
    )
  })

  it("limited → 429 + retry-after; cancel service not called", async () => {
    consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 })
    const res = await handleCancel(req(), "1")
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("300")
    expect(((await res.json()) as { error: { messageKey: string } }).error.messageKey).toBe("scheduling.CANCEL_RATE_LIMITED")
    expect(cancelEnrollment).not.toHaveBeenCalled()
  })
})
