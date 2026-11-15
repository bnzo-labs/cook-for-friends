import { afterEach, describe, expect, it, vi } from "vitest"

import { logError, safeErrorFields } from "../server/log-error"

/** W4-03b (W2-11 L-5): commerce error logs never carry Stripe params / PII. */
describe("safeErrorFields / logError (unit)", () => {
  afterEach(() => vi.restoreAllMocks())

  const stripeErr = Object.assign(new Error("Invalid email address: jane.doe@example.com"), {
    type: "StripeInvalidRequestError",
    rawType: "invalid_request_error",
    code: "email_invalid",
    param: "customer_email",
    statusCode: 400,
    requestId: "req_123",
    raw: { message: "Invalid email address: jane.doe@example.com" },
    headers: { "stripe-account": "acct_x" },
  })

  it("Stripe error → machine fields only, no message", () => {
    expect(safeErrorFields(stripeErr)).toEqual({
      type: "StripeInvalidRequestError",
      code: "email_invalid",
      param: "customer_email",
      statusCode: 400,
      requestId: "req_123",
    })
  })

  it("other error → name + message (+ code)", () => {
    expect(safeErrorFields(Object.assign(new TypeError("boom"), { code: "E1" }))).toEqual({ name: "TypeError", message: "boom", code: "E1" })
    expect(safeErrorFields("plain")).toEqual({ message: "plain" })
    expect(safeErrorFields(null)).toEqual({ message: "null" })
  })

  it("logError writes one JSON line with event + context + safe error; no PII", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    logError("commerce.checkout.session_create_failed", stripeErr, { holdId: 7 })
    expect(spy).toHaveBeenCalledTimes(1)
    const [line] = spy.mock.calls[0]!
    expect(typeof line).toBe("string")
    expect(JSON.parse(line as string)).toEqual({
      event: "commerce.checkout.session_create_failed",
      level: "error",
      holdId: 7,
      error: { type: "StripeInvalidRequestError", code: "email_invalid", param: "customer_email", statusCode: 400, requestId: "req_123" },
    })
    expect(line).not.toContain("example.com")
  })
})
