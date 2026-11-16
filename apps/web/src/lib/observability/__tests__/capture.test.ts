import { beforeEach, describe, expect, it, vi } from "vitest"

const scope = { setLevel: vi.fn(), setTag: vi.fn(), setFingerprint: vi.fn() }
const captureException = vi.fn()
vi.mock("@sentry/nextjs", () => ({
  withScope: (cb: (s: typeof scope) => void) => cb(scope),
  captureException: (e: unknown) => captureException(e),
}))

import { captureCronFailure, captureJobFailure, captureWebhookError } from "../capture"

const tags = () => Object.fromEntries(scope.setTag.mock.calls)

beforeEach(() => vi.clearAllMocks())

describe("capture helpers", () => {
  it("captureWebhookError tags source and never forwards Stripe params", () => {
    const stripeErr = Object.assign(new Error("Invalid email: marie@example.com"), {
      type: "StripeInvalidRequestError",
      code: "email_invalid",
      param: "customer_email",
    })
    captureWebhookError("stripe", stripeErr, { eventId: "evt_1", eventType: "checkout.session.completed" })
    expect(tags()).toMatchObject({ webhook: "stripe", alert: "webhook:stripe", event_id: "evt_1" })
    const sent = captureException.mock.calls[0]![0] as Error
    expect(sent.message).not.toContain("marie")
    expect(sent.name).toBe("StripeInvalidRequestError")
    expect(scope.setLevel).toHaveBeenCalledWith("error")
  })

  it("captureWebhookError redacts emails in plain errors", () => {
    captureWebhookError("mux", new Error("failed for a@b.co"))
    expect((captureException.mock.calls[0]![0] as Error).message).not.toContain("a@b.co")
    expect(tags().alert).toBe("webhook:mux")
  })

  it("captureCronFailure tags the route", () => {
    captureCronFailure("reminders", new Error("boom"))
    expect(tags()).toMatchObject({ cron: "reminders", alert: "cron:reminders" })
  })

  it("captureJobFailure tags task + key and carries no recipient", () => {
    captureJobFailure("send-email", { idempotencyKey: "k-1" })
    expect(tags()).toMatchObject({ job: "send-email", alert: "job:send-email", idempotency_key: "k-1" })
    expect(JSON.stringify(captureException.mock.calls)).not.toContain("@")
  })
})
