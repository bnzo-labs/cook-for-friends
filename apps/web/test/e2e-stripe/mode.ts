/**
 * W4-01 mode switch (W4-00 contract). Test-only, never imported by `src/**`.
 *  - live-test      real Stripe sandbox + hosted Checkout + `stripe listen`
 *  - signed-events  no Stripe key: the app talks to the local fake Stripe wire
 *                   (`fake-stripe-server.mjs`); webhooks are synthetic + signed.
 */
import type { TestInfo } from "@playwright/test"

export type StripeMode = "live-test" | "signed-events"

export const MODE: StripeMode = process.env.E2E_STRIPE_MODE === "live-test" ? "live-test" : "signed-events"
export const isLive = MODE === "live-test"
export const FAKE_CONTROL = process.env.E2E_FAKE_STRIPE_CONTROL_URL ?? "http://127.0.0.1:12112"

/** A spec never assumes a mode silently: log it and attach it to the report. */
export function logMode(info: TestInfo): void {
  info.annotations.push({ type: "stripe-mode", description: MODE })
  console.log(`[w4-01] ${info.title} :: stripe mode = ${MODE}`)
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the W4-01 specs`)
  return value
}
