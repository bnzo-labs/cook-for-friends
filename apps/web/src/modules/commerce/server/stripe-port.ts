import type Stripe from "stripe"

import { getStripeClient } from "@/lib/stripe"

/**
 * The only seam between commerce and Stripe (same pattern as identity's email
 * sender). Production code always gets the real client; tests swap in a fake.
 */
let override: Stripe | null = null

export function getStripe(): Stripe {
  return override ?? getStripeClient()
}

/** Test-only. Pass `null` to restore the real client. */
export function setStripeForTests(fake: Stripe | null): void {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new Error("setStripeForTests is test-only")
  }
  override = fake
}

/** Stripe refuses to expire a session that is already expired or complete. */
export function isClosedSessionError(error: unknown): boolean {
  const e = error as { type?: string; rawType?: string; statusCode?: number } | null
  return e?.type === "StripeInvalidRequestError" || e?.rawType === "invalid_request_error"
}

/**
 * Best-effort: expire open Checkout sessions. Already closed → ignored (not an
 * error). Other failures are logged; Stripe expires the session on its own at
 * `expires_at` and the webhook handles it. Returns how many were expired.
 */
export async function expireCheckoutSessions(ids: (string | null)[]): Promise<number> {
  let expired = 0
  for (const id of ids) {
    if (!id) continue
    try {
      await getStripe().checkout.sessions.expire(id)
      expired += 1
    } catch (error) {
      if (isClosedSessionError(error)) continue
      console.error("[commerce] checkout.sessions.expire failed", { id, error })
    }
  }
  return expired
}
