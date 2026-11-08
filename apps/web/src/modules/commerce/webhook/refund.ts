import type Stripe from "stripe"
import { z } from "zod"

import type { ID, ModuleError, Result } from "@/modules/_shared"
import type { Order } from "@/payload-types"

import { getPayload } from "../server/payload"
import { getStripe } from "../server/stripe-port"
import { findOrderById } from "./orders"
import { logEvent, relId } from "./shared"

const fail = (error: ModuleError): Result<never> => ({ ok: false, error })
const invalid = (path: string, message: string) => fail({ code: "VALIDATION", issues: [{ path, message }] })

/** Σ of recorded refunds (cents). */
export const refundedSoFar = (order: Pick<Order, "refunds">): number =>
  (order.refunds ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0)

export type StripeRefundRequest = {
  paymentIntentId: string
  amount: number
  idempotencyKey: string
  metadata: Record<string, string>
}

const isAlreadyRefunded = (error: unknown) => (error as { code?: string } | null)?.code === "charge_already_refunded"

/**
 * Creates one Stripe refund through the commerce port. A retried delivery of an
 * oversell whose refund already went through (new order id → new key) hits
 * `charge_already_refunded`: the existing refund is returned instead.
 */
export async function createStripeRefund(r: StripeRefundRequest): Promise<Stripe.Refund> {
  const stripe = getStripe()
  try {
    return await stripe.refunds.create(
      { payment_intent: r.paymentIntentId, amount: r.amount, metadata: r.metadata },
      { idempotencyKey: r.idempotencyKey },
    )
  } catch (error) {
    if (!isAlreadyRefunded(error)) throw error
    const { data } = await stripe.refunds.list({ payment_intent: r.paymentIntentId, limit: 100 })
    const existing = data.find((x) => x.status === "succeeded" || x.status === "pending")
    if (!existing) throw error
    logEvent("warn", "webhook.refund.already_refunded", { paymentIntentId: r.paymentIntentId })
    return existing
  }
}

const refundInputSchema = z.object({
  orderId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(500),
  enrollmentId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
})

async function enrollmentBelongsTo(orderId: number, enrollmentId: number): Promise<boolean> {
  const payload = await getPayload()
  const { totalDocs } = await payload.count({
    collection: "enrollments",
    where: { and: [{ id: { equals: enrollmentId } }, { order: { equals: orderId } }] },
    overrideAccess: true,
  })
  return totalDocs > 0
}

/**
 * CONTRACT §4 `refundOrder`. Creates the Stripe refund only; the order,
 * enrollments and entitlements change when `charge.refunded` arrives.
 * `amount` defaults to the remaining refundable amount; more than that → VALIDATION.
 */
export async function refundOrder(i: { orderId: ID; amount?: number; reason: string; enrollmentId?: ID }): Promise<Result<void>> {
  const parsed = refundInputSchema.safeParse(i)
  if (!parsed.success) {
    return fail({ code: "VALIDATION", issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) })
  }
  const orderId = Number(parsed.data.orderId)
  const enrollmentId = parsed.data.enrollmentId !== undefined ? Number(parsed.data.enrollmentId) : null

  const payload = await getPayload()
  const order = await findOrderById(payload, orderId)
  if (!order) return fail({ code: "NOT_FOUND", entity: "order" })
  if (order.status !== "paid" && order.status !== "partially_refunded") {
    return fail({ code: "CONFLICT", reason: "ORDER_NOT_REFUNDABLE" })
  }
  if (!order.stripePaymentIntentId) return fail({ code: "CONFLICT", reason: "ORDER_NOT_REFUNDABLE" })

  const already = refundedSoFar(order)
  const remaining = Number(order.total) - already
  const amount = parsed.data.amount ?? remaining
  if (amount <= 0 || amount > remaining) return invalid("amount", "AMOUNT_EXCEEDS_REFUNDABLE")
  if (enrollmentId !== null && !(await enrollmentBelongsTo(orderId, enrollmentId))) {
    return invalid("enrollmentId", "ENROLLMENT_NOT_IN_ORDER")
  }

  const scope = enrollmentId !== null ? `e${enrollmentId}` : "order"
  try {
    await createStripeRefund({
      paymentIntentId: order.stripePaymentIntentId,
      amount,
      idempotencyKey: `refund-${orderId}-${scope}-${already}-${amount}`,
      metadata: {
        orderId: String(orderId),
        reason: parsed.data.reason,
        ...(enrollmentId !== null ? { enrollmentId: String(enrollmentId) } : {}),
      },
    })
    return { ok: true, data: undefined }
  } catch (error) {
    console.error("[commerce] refundOrder: Stripe refund failed", { orderId, error })
    const message = error instanceof Error ? error.message : "stripe error"
    return fail({ code: "UPSTREAM", service: "stripe", message })
  }
}

/** Customer ids of every attendee of an order (in-person: enrollments; online: the buyer). */
export function attendeeCustomerIds(order: Order, enrollmentCustomers: (number | null)[]): number[] {
  const ids = enrollmentCustomers.filter((x): x is number => x !== null)
  const buyer = relId(order.customer)
  if (ids.length === 0 && buyer !== null) return [buyer]
  return [...new Set(ids)]
}
