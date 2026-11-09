/**
 * W2-07 webhook test helpers: signed Stripe events + a recording fake Stripe
 * (through the W2-04 port). Fictional data, @example.com only.
 */
import { sql } from "@payloadcms/db-postgres/drizzle"
import type { Payload } from "payload"
import Stripe from "stripe"

import { uid } from "../../../../test/integration"
import { executorFor } from "../server/tx"

export const TEST_WEBHOOK_SECRET = "whsec_test_w207_not_a_real_secret"

export function sign(event: object): { raw: string; signature: string } {
  const raw = JSON.stringify(event)
  return { raw, signature: Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: TEST_WEBHOOK_SECRET }) }
}

export type FakeRefund = { id: string; amount: number; payment_intent: string; status: string; metadata: Record<string, string>; created: number; reason: null }

export type WebhookFake = {
  client: Stripe
  lineItems: Map<string, { quantity: number; unit: number; description: string }>
  invoices: Map<string, { id: string; invoice_pdf: string | null }>
  refunds: { params: Stripe.RefundCreateParams; key?: string; refund: FakeRefund }[]
  invoicePayments: Map<string, string>
  /** PaymentIntent metadata by id (`paymentIntents.retrieve`); unknown id → `{}` (foreign). */
  paymentIntents: Map<string, Record<string, string>>
  reset: () => void
}

export function makeWebhookFake(): WebhookFake {
  const fake: WebhookFake = {
    lineItems: new Map(),
    invoices: new Map(),
    refunds: [],
    invoicePayments: new Map(),
    paymentIntents: new Map(),
    reset: () => {
      fake.lineItems.clear()
      fake.invoices.clear()
      fake.refunds.length = 0
      fake.invoicePayments.clear()
      fake.paymentIntents.clear()
    },
    client: {} as Stripe,
  }
  const byKey = new Map<string, FakeRefund>()
  fake.client = {
    checkout: {
      sessions: {
        listLineItems: async (id: string) => {
          const li = fake.lineItems.get(id)
          if (!li) throw new Error(`fake: no line items for ${id}`)
          return {
            data: [
              { quantity: li.quantity, amount_subtotal: li.unit * li.quantity, description: li.description, price: { unit_amount: li.unit } },
            ],
          }
        },
        retrieve: async (id: string) => ({ id, total_details: { amount_tax: 0, breakdown: { taxes: [], discounts: [] } } }),
        expire: async (id: string) => ({ id, status: "expired" }),
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => ({ id, object: "payment_intent", metadata: fake.paymentIntents.get(id) ?? {} }),
    },
    invoices: {
      retrieve: async (id: string) => fake.invoices.get(id) ?? { id, invoice_pdf: null },
    },
    invoicePayments: {
      list: async ({ invoice }: { invoice: string }) => {
        const pi = fake.invoicePayments.get(invoice)
        return { data: pi ? [{ payment: { type: "payment_intent", payment_intent: pi } }] : [] }
      },
    },
    refunds: {
      create: async (params: Stripe.RefundCreateParams, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey
        if (key && byKey.has(key)) return byKey.get(key)
        const refund: FakeRefund = {
          id: `re_test_${uid()}`,
          amount: Number(params.amount),
          payment_intent: String(params.payment_intent),
          status: "succeeded",
          metadata: (params.metadata ?? {}) as Record<string, string>,
          created: Math.floor(Date.now() / 1000),
          reason: null,
        }
        if (key) byKey.set(key, refund)
        fake.refunds.push({ params, key, refund })
        return refund
      },
      list: async (p: { charge?: string; payment_intent?: string }) => ({
        data: fake.refunds.map((r) => r.refund).filter((r) => !p.payment_intent || r.payment_intent === p.payment_intent),
      }),
    },
  } as unknown as Stripe
  return fake
}

type CompletedOpts = {
  csId?: string
  courseId: number
  sessionId?: number
  holdId?: number
  quantity?: number
  unit?: number
  email?: string
  name?: string
  locale?: "fr" | "en"
  pi?: string
  invoice?: string | null
  type?: "checkout.session.completed" | "checkout.session.async_payment_succeeded"
  /** 100 % promotion code: `no_payment_required`, `amount_total` 0, no PaymentIntent (W2-21). */
  zeroAmount?: boolean
}

export function completedEvent(fake: WebhookFake, o: CompletedOpts) {
  const csId = o.csId ?? `cs_test_${uid()}`
  const quantity = o.quantity ?? 1
  const unit = o.unit ?? 5000
  fake.lineItems.set(csId, { quantity, unit, description: "Test course" })
  const subtotal = unit * quantity
  const total = o.zeroAmount ? 0 : subtotal
  return {
    csId,
    total,
    /** Unused when `zeroAmount` (the session carries no PaymentIntent). */
    pi: o.pi ?? `pi_test_${uid()}`,
    event(id = `evt_${uid()}`) {
      return {
        id,
        object: "event",
        type: o.type ?? "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: csId,
            object: "checkout.session",
            payment_status: o.zeroAmount ? "no_payment_required" : "paid",
            amount_subtotal: subtotal,
            amount_total: total,
            total_details: { amount_discount: subtotal - total, amount_shipping: 0, amount_tax: 0 },
            customer_details: { email: o.email ?? `buyer-${uid()}@example.com`, name: o.name ?? "Buyer Person" },
            customer_email: null,
            payment_intent: o.zeroAmount ? null : this.pi,
            invoice: o.invoice ?? null,
            discounts: [],
            metadata: {
              cartToken: `cart_${uid()}`,
              courseId: String(o.courseId),
              ...(o.sessionId !== undefined ? { sessionId: String(o.sessionId) } : {}),
              ...(o.holdId !== undefined ? { holdId: String(o.holdId) } : {}),
              locale: o.locale ?? "fr",
              quantity: String(quantity),
            },
          },
        },
      }
    },
  }
}

export function closedEvent(type: "checkout.session.expired" | "checkout.session.async_payment_failed", o: { csId: string; courseId: number; sessionId?: number; holdId?: number; quantity?: number; email?: string }) {
  return {
    id: `evt_${uid()}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: o.csId,
        object: "checkout.session",
        payment_status: "unpaid",
        amount_subtotal: 5000,
        amount_total: 5000,
        total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
        customer_details: o.email ? { email: o.email, name: null } : null,
        customer_email: null,
        payment_intent: null,
        metadata: {
          cartToken: `cart_${uid()}`,
          courseId: String(o.courseId),
          ...(o.sessionId !== undefined ? { sessionId: String(o.sessionId) } : {}),
          ...(o.holdId !== undefined ? { holdId: String(o.holdId) } : {}),
          locale: "fr",
          quantity: String(o.quantity ?? 1),
        },
      },
    },
  }
}

/**
 * Stripe copies PaymentIntent metadata onto the Charge, so an app charge carries
 * `cartToken`. `foreign: true` → a charge this app never created (no metadata).
 */
export function chargeRefundedEvent(o: { pi: string; amount: number; refunded: number; refunds: FakeRefund[]; foreign?: boolean }) {
  return {
    id: `evt_${uid()}`,
    object: "event",
    type: "charge.refunded",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `ch_test_${uid()}`,
        object: "charge",
        amount: o.amount,
        amount_refunded: o.refunded,
        refunded: o.refunded >= o.amount,
        payment_intent: o.pi,
        metadata: o.foreign ? {} : { cartToken: `cart_${uid()}` },
        refunds: { object: "list", data: o.refunds, has_more: false },
      },
    },
  }
}

/** App invoices carry the checkout metadata (`invoice_creation.invoice_data.metadata`); `foreign` → none. */
export function invoiceFinalizedEvent(o: { invoiceId: string; pdf: string; foreign?: boolean }) {
  return {
    id: `evt_${uid()}`,
    object: "event",
    type: "invoice.finalized",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: o.invoiceId, object: "invoice", invoice_pdf: o.pdf, metadata: o.foreign ? {} : { cartToken: `cart_${uid()}` } } },
  }
}

/** Refund object as Stripe would carry it on a charge (for dashboard / refundOrder refunds). */
export const stripeRefund = (pi: string, amount: number, metadata: Record<string, string> = {}): FakeRefund => ({
  id: `re_test_${uid()}`,
  amount,
  payment_intent: pi,
  status: "succeeded",
  metadata,
  created: Math.floor(Date.now() / 1000),
  reason: null,
})

// ---------- DB assertions ----------

export async function countJobs(key: string): Promise<number> {
  const db = await executorFor()
  const { rows } = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM payload_jobs WHERE input->>'idempotencyKey' = ${key}`)
  return Number(rows[0]?.n ?? 0)
}

export async function jobsLike(prefix: string, template: string): Promise<{ to: string; key: string; data: Record<string, unknown> }[]> {
  const db = await executorFor()
  const { rows } = await db.execute<{ input: { to: string; idempotencyKey: string; data: Record<string, unknown>; template: string } }>(
    sql`SELECT input FROM payload_jobs WHERE input->>'idempotencyKey' LIKE ${`${prefix}%`} AND input->>'template' = ${template}`,
  )
  return rows.map((r) => ({ to: r.input.to, key: r.input.idempotencyKey, data: r.input.data }))
}

export async function ledger(eventId: string): Promise<{ outcome: string }[]> {
  const db = await executorFor()
  const { rows } = await db.execute<{ outcome: string }>(sql`SELECT outcome FROM processed_stripe_events WHERE event_id = ${eventId}`)
  return rows
}

export async function ordersFor(payload: Payload, csId: string) {
  const { docs } = await payload.find({ collection: "orders", where: { stripeCheckoutSessionId: { equals: csId } }, depth: 0, overrideAccess: true })
  return docs
}

export async function enrollmentsOf(payload: Payload, where: { order?: number; session?: number }) {
  const { docs } = await payload.find({
    collection: "enrollments",
    where: { and: [...(where.order ? [{ order: { equals: where.order } }] : []), ...(where.session ? [{ session: { equals: where.session } }] : [])] },
    depth: 0,
    pagination: false,
    sort: "attendeeIndex",
    overrideAccess: true,
  })
  return docs
}

export async function entitlementsOf(payload: Payload, orderId: number) {
  const { docs } = await payload.find({
    collection: "entitlements",
    where: { and: [{ source: { equals: "purchase" } }, { sourceRef: { equals: String(orderId) } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}
