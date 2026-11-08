import type Stripe from "stripe"

/** Recording fake for the commerce Stripe port. Test helper only. */
export type FakeStripe = {
  client: Stripe
  creates: { params: Stripe.Checkout.SessionCreateParams; options?: { idempotencyKey?: string } }[]
  expires: string[]
  failNextCreate: (error?: unknown) => void
  closeSession: (id: string) => void
  reset: () => void
}

export function makeFakeStripe(): FakeStripe {
  let n = 0
  let fail: unknown = null
  const closed = new Set<string>()
  const fake: FakeStripe = {
    creates: [],
    expires: [],
    failNextCreate: (error = Object.assign(new Error("boom"), { type: "StripeAPIError" })) => {
      fail = error
    },
    closeSession: (id) => closed.add(id),
    reset: () => {
      fake.creates.length = 0
      fake.expires.length = 0
      closed.clear()
      fail = null
    },
    client: {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options?: { idempotencyKey?: string }) => {
            if (fail) {
              const e = fail
              fail = null
              throw e
            }
            fake.creates.push({ params, options })
            n += 1
            const id = `cs_test_fake_${Date.now().toString(36)}_${n}`
            return { id, url: `https://checkout.stripe.com/c/pay/${id}`, expires_at: params.expires_at }
          },
          expire: async (id: string) => {
            if (closed.has(id)) {
              throw Object.assign(new Error("Only Checkout Sessions with a status of open can be expired"), {
                type: "StripeInvalidRequestError",
              })
            }
            fake.expires.push(id)
            closed.add(id)
            return { id, status: "expired" }
          },
        },
      },
    } as unknown as Stripe,
  }
  return fake
}
