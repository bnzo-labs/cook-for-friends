import Stripe from "stripe"

/**
 * Single Stripe client (DISCOVERY §2: stripe 22.6.2, API `2026-08-26.dahlia`).
 * Server-only: the secret key never reaches a client bundle. Commerce reaches
 * Stripe exclusively through `commerce/server/stripe-port.ts`.
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const

let client: Stripe | null = null

/** Lazy so importing this file never requires the secret (unit tests, CLI). */
export function getStripeClient(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || !key.startsWith("sk_")) {
    throw new Error("STRIPE_SECRET_KEY is missing or invalid")
  }
  client = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    appInfo: { name: "cook-for-friends" },
  })
  return client
}
