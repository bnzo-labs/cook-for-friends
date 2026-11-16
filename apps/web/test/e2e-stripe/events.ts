/**
 * Synthetic, correctly signed Stripe events (signed-events mode) and the live-mode
 * equivalents. Metadata is read back from what the app really sent to Stripe, so
 * a drift in `buildSessionParams` fails these specs. Test-only.
 */
import type { APIRequestContext } from "@playwright/test"
import Stripe from "stripe"

import { FAKE_CONTROL, isLive, requireEnv } from "./mode"

export type SessionInfo = {
  id: string
  status: string
  metadata: Record<string, string>
  success_url: string
  cancel_url: string
  customer_email: string | null
  quantity: number
  unitAmount: number
  amount_subtotal: number
}

export async function fakeSession(id: string): Promise<SessionInfo> {
  const res = await fetch(`${FAKE_CONTROL}/__e2e/sessions/${id}`)
  if (!res.ok) throw new Error(`fake Stripe: unknown session ${id} (${res.status})`)
  return (await res.json()) as SessionInfo
}

export async function setFakeSessionStatus(id: string, status: "open" | "complete" | "expired"): Promise<void> {
  const res = await fetch(`${FAKE_CONTROL}/__e2e/sessions/${id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`fake Stripe: status update failed (${res.status})`)
}

export async function fakeRefunds(paymentIntent: string): Promise<Array<{ id: string; amount: number; payment_intent: string }>> {
  const res = await fetch(`${FAKE_CONTROL}/__e2e/refunds?payment_intent=${encodeURIComponent(paymentIntent)}`)
  return ((await res.json()) as { data: Array<{ id: string; amount: number; payment_intent: string }> }).data
}

let seq = 0
const eventId = (prefix: string) => `evt_e2e_${prefix}_${Date.now().toString(36)}${(seq += 1)}`

function envelope(id: string, type: string, object: unknown): string {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-08-26.dahlia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  })
}

export const paymentIntentOf = (sessionId: string) => `pi_e2e_${sessionId.slice(-14)}`
export const invoiceOf = (sessionId: string) => `in_e2e_${sessionId.slice(-14)}`

export type Buyer = { email: string; name: string }

/** `checkout.session.completed` exactly as Stripe sends it for a paid app session. */
export function completedPayload(s: SessionInfo, buyer: Buyer): { id: string; payload: string } {
  const total = s.unitAmount * s.quantity
  const id = eventId("done")
  return {
    id,
    payload: envelope(id, "checkout.session.completed", {
      id: s.id,
      object: "checkout.session",
      status: "complete",
      payment_status: "paid",
      metadata: s.metadata,
      customer_email: buyer.email,
      customer_details: { email: buyer.email, name: buyer.name },
      amount_subtotal: total,
      amount_total: total,
      total_details: { amount_tax: 0, amount_discount: 0 },
      currency: "cad",
      payment_intent: paymentIntentOf(s.id),
      invoice: { id: invoiceOf(s.id), object: "invoice", invoice_pdf: null },
      discounts: [],
    }),
  }
}

/** `invoice.finalized` for the invoice created with the session (receipt PDF). */
export function invoiceFinalizedPayload(s: SessionInfo): { id: string; payload: string; pdfUrl: string } {
  const id = eventId("inv")
  const pdfUrl = `https://pay.stripe.test/invoice/${invoiceOf(s.id)}/pdf`
  return {
    id,
    pdfUrl,
    payload: envelope(id, "invoice.finalized", {
      id: invoiceOf(s.id),
      object: "invoice",
      metadata: s.metadata,
      invoice_pdf: pdfUrl,
      payments: { object: "list", has_more: false, data: [{ payment: { type: "payment_intent", payment_intent: paymentIntentOf(s.id) } }] },
    }),
  }
}

export type Delivery = { status: number; outcome: string | null }

/** POST a raw payload to the app webhook, signed with the CI secret. */
export async function deliver(request: APIRequestContext, payload: string): Promise<Delivery> {
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: requireEnv("STRIPE_WEBHOOK_SECRET") })
  const res = await request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "content-type": "application/json", "stripe-signature": header },
  })
  const body = (await res.json().catch(() => null)) as { data?: { outcome?: string } } | null
  return { status: res.status(), outcome: body?.data?.outcome ?? null }
}

/**
 * Replay payload for a completed session: signed-events re-sends the same bytes;
 * live-test reads the real event back from the sandbox and re-signs it with the
 * `stripe listen` secret (same effect as `stripe events resend`).
 */
export async function replayablePayload(sessionId: string, original: string | null): Promise<string> {
  if (!isLive && original) return original
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"))
  const { data } = await stripe.events.list({ type: "checkout.session.completed", limit: 100 })
  const found = data.find((e) => (e.data.object as { id?: string }).id === sessionId)
  if (!found) throw new Error(`no checkout.session.completed event found for ${sessionId}`)
  return JSON.stringify(found)
}
