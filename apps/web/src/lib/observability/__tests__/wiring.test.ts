import { beforeEach, describe, expect, it, vi } from "vitest"

const captureWebhookError = vi.fn()
const captureCronFailure = vi.fn()
const captureJobFailure = vi.fn()
vi.mock("@/lib/observability/capture", () => ({
  captureWebhookError: (...a: unknown[]) => captureWebhookError(...a),
  captureCronFailure: (...a: unknown[]) => captureCronFailure(...a),
  captureJobFailure: (...a: unknown[]) => captureJobFailure(...a),
}))

const handleStripeEvent = vi.fn()
vi.mock("@/modules/commerce", () => ({
  handleStripeEvent: (...a: unknown[]) => handleStripeEvent(...a),
  logCommerceError: vi.fn(),
  moduleErrorResponse: (e: { code: string }) => ({ status: e.code === "UPSTREAM" ? 502 : 400, body: { ok: false } }),
  expireStaleHolds: vi.fn().mockRejectedValue(new Error("db down")),
}))
vi.mock("@/modules/identity", () => ({
  jsonResponse: (status: number, body: unknown) => new Response(JSON.stringify(body), { status }),
}))
vi.mock("@/modules/scheduling", () => ({ sendDueReminders: vi.fn().mockRejectedValue(new Error("boom")) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("CRON_SECRET", "x".repeat(32))
})

describe("stripe webhook route", () => {
  const req = () => new Request("http://t/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } })

  it("captures on thrown error (500)", async () => {
    handleStripeEvent.mockRejectedValueOnce(new Error("kaboom"))
    const { POST } = await import("@/app/api/stripe/webhook/route")
    expect((await POST(req())).status).toBe(500)
    expect(captureWebhookError).toHaveBeenCalledWith("stripe", expect.any(Error))
  })

  it("captures on 5xx module error, not on 4xx", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route")
    handleStripeEvent.mockResolvedValueOnce({ ok: false, error: { code: "UPSTREAM" } })
    await POST(req())
    expect(captureWebhookError).toHaveBeenCalledTimes(1)
    handleStripeEvent.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION" } })
    await POST(req())
    expect(captureWebhookError).toHaveBeenCalledTimes(1)
  })
})

describe("cron routes", () => {
  const authed = () => new Request("http://t/api/cron/x", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }) as never

  it("expire-holds failure is captured", async () => {
    const { GET } = await import("@/app/api/cron/expire-holds/route")
    expect((await GET(authed())).status).toBe(500)
    expect(captureCronFailure).toHaveBeenCalledWith("expire-holds", expect.any(Error))
  })

  it("reminders failure is captured", async () => {
    const { GET } = await import("@/app/api/cron/reminders/route")
    expect((await GET(authed())).status).toBe(500)
    expect(captureCronFailure).toHaveBeenCalledWith("reminders", expect.any(Error))
  })

  it("unauthorized is not a failure", async () => {
    const { GET } = await import("@/app/api/cron/reminders/route")
    expect((await GET(new Request("http://t/x") as never)).status).toBe(401)
    expect(captureCronFailure).not.toHaveBeenCalled()
  })
})

describe("send-email onFail", () => {
  it("alerts only on the final attempt, without recipient", async () => {
    const { sendEmailTask } = await import("@/modules/notifications/jobs/send-email")
    const onFail = sendEmailTask.onFail as (a: unknown) => void
    const input = { to: "marie@example.com", idempotencyKey: "k-9" }
    onFail({ input, taskStatus: { totalTried: 1 } })
    expect(captureJobFailure).not.toHaveBeenCalled()
    onFail({ input, taskStatus: { totalTried: 3 } })
    expect(captureJobFailure).toHaveBeenCalledWith("send-email", { idempotencyKey: "k-9" })
    expect(JSON.stringify(captureJobFailure.mock.calls)).not.toContain("marie")
  })
})
