import { afterEach, describe, expect, it } from "vitest"

import { getStripeClient, STRIPE_API_VERSION } from "@/lib/stripe"

import { expireCheckoutSessions, getStripe, isClosedSessionError, setStripeForTests } from "../server/stripe-port"
import { makeFakeStripe } from "./fake-stripe"

describe("lib/stripe", () => {
  it("pins the API version", () => {
    expect(STRIPE_API_VERSION).toBe("2026-08-26.dahlia")
  })

  it("refuses to build a client without a secret key", () => {
    const key = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    try {
      expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY/)
    } finally {
      if (key !== undefined) process.env.STRIPE_SECRET_KEY = key
    }
  })
})

describe("stripe port", () => {
  afterEach(() => setStripeForTests(null))

  it("returns the test override when set", () => {
    const fake = makeFakeStripe()
    setStripeForTests(fake.client)
    expect(getStripe()).toBe(fake.client)
  })

  it("setStripeForTests is refused outside tests", () => {
    const nodeEnv = process.env.NODE_ENV
    const vitest = process.env.VITEST
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = "production"
    delete env.VITEST
    try {
      expect(() => setStripeForTests(null)).toThrow(/test-only/)
    } finally {
      env.NODE_ENV = nodeEnv
      env.VITEST = vitest
    }
  })

  it("isClosedSessionError recognises Stripe invalid-request errors only", () => {
    expect(isClosedSessionError({ type: "StripeInvalidRequestError" })).toBe(true)
    expect(isClosedSessionError({ rawType: "invalid_request_error" })).toBe(true)
    expect(isClosedSessionError({ type: "StripeConnectionError" })).toBe(false)
    expect(isClosedSessionError(null)).toBe(false)
  })

  it("expireCheckoutSessions: counts expired, ignores closed + null, survives network errors", async () => {
    const fake = makeFakeStripe()
    fake.closeSession("cs_done")
    const client = fake.client as unknown as { checkout: { sessions: { expire: (id: string) => Promise<unknown> } } }
    const realExpire = client.checkout.sessions.expire
    client.checkout.sessions.expire = async (id: string) => {
      if (id === "cs_net") throw Object.assign(new Error("socket"), { type: "StripeConnectionError" })
      return realExpire(id)
    }
    setStripeForTests(fake.client)
    expect(await expireCheckoutSessions(["cs_open", null, "cs_done", "cs_net"])).toBe(1)
    expect(fake.expires).toEqual(["cs_open"])
  })
})
