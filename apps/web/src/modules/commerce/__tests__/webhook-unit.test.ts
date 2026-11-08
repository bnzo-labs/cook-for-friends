import { afterEach, describe, expect, it, vi } from "vitest"

import { formatOrderNumber, pendingOrderNumber, splitSeatAmounts } from "../webhook/order-number"
import { parseCheckoutMetadata, tryParseCheckoutMetadata } from "../webhook/shared"
import { TEST_WEBHOOK_SECRET, sign } from "./webhook-helpers"

describe("W2-07 order number + seat amounts", () => {
  it("CFF- + id zero-padded to 6", () => {
    expect(formatOrderNumber(123)).toBe("CFF-000123")
    expect(formatOrderNumber("7")).toBe("CFF-000007")
    expect(formatOrderNumber(1234567)).toBe("CFF-1234567")
    expect(() => formatOrderNumber(0)).toThrow()
    expect(pendingOrderNumber("cs_1")).toBe("PENDING-cs_1")
  })

  it.each([
    [10000, 3, [3334, 3333, 3333]],
    [9999, 3, [3333, 3333, 3333]],
    [5749, 1, [5749]],
    [1, 4, [1, 0, 0, 0]],
    [0, 2, [0, 0]],
  ])("split %i over %i seats", (total, n, expected) => {
    const seats = splitSeatAmounts(total, n)
    expect(seats).toEqual(expected)
    expect(seats.reduce((a, b) => a + b, 0)).toBe(total)
  })

  it("rejects invalid totals and seat counts", () => {
    expect(() => splitSeatAmounts(-1, 2)).toThrow()
    expect(() => splitSeatAmounts(10.5, 2)).toThrow()
    expect(() => splitSeatAmounts(100, 0)).toThrow()
  })
})

describe("W2-07 checkout metadata", () => {
  const good = { cartToken: "c", holdId: "12", courseId: "3", sessionId: "4", locale: "en", quantity: "2" }

  it("parses W2-04 keys", () => {
    expect(parseCheckoutMetadata(good, "t")).toEqual({ cartToken: "c", holdId: 12, courseId: 3, sessionId: 4, locale: "en", quantity: 2 })
    const { holdId: _h, sessionId: _s, ...online } = good
    void _h
    void _s
    expect(parseCheckoutMetadata(online, "t")).toMatchObject({ holdId: null, sessionId: null })
  })

  it("never trusts malformed metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => parseCheckoutMetadata({ ...good, quantity: "0" }, "t")).toThrow(/metadata/)
    expect(() => parseCheckoutMetadata({ ...good, courseId: "x" }, "t")).toThrow()
    expect(() => parseCheckoutMetadata(null, "t")).toThrow()
    expect(tryParseCheckoutMetadata({})).toBeNull()
    spy.mockRestore()
  })
})

describe("W2-07 handleStripeEvent signature (no DB)", () => {
  vi.setConfig({ testTimeout: 60_000 })
  const original = process.env.STRIPE_WEBHOOK_SECRET
  afterEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = original
    vi.restoreAllMocks()
  })

  it("missing secret → throws (fail closed) + error log", async () => {
    const { handleStripeEvent, WebhookConfigError } = await import("../webhook/envelope")
    delete process.env.STRIPE_WEBHOOK_SECRET
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { raw, signature } = sign({ id: "evt_1", object: "event", type: "x", data: { object: {} } })
    await expect(handleStripeEvent(raw, signature)).rejects.toBeInstanceOf(WebhookConfigError)
    expect(log).toHaveBeenCalled()
  })

  it("bad signature → VALIDATION; tampered body → VALIDATION", async () => {
    const { handleStripeEvent } = await import("../webhook/envelope")
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { raw, signature } = sign({ id: "evt_1", object: "event", type: "x", data: { object: {} } })
    const bogus = await handleStripeEvent(raw, "t=1,v1=deadbeef")
    expect(!bogus.ok && bogus.error.code).toBe("VALIDATION")
    const tampered = await handleStripeEvent(raw.replace("evt_1", "evt_2"), signature)
    expect(!tampered.ok && tampered.error.code).toBe("VALIDATION")
  })

  it("route: no signature header → 400; bogus → 400; missing secret → 500", async () => {
    const route = await import("@/app/api/stripe/webhook/route")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const req = (headers: Record<string, string>) =>
      new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers, body: "{}" })

    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    expect((await route.POST(req({}))).status).toBe(400)
    expect((await route.POST(req({ "stripe-signature": "t=1,v1=bad" }))).status).toBe(400)
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect((await route.POST(req({ "stripe-signature": "t=1,v1=bad" }))).status).toBe(500)
  })
})
