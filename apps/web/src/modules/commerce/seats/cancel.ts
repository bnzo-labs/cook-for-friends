import { sql } from "@payloadcms/db-postgres/drizzle"
import { z } from "zod"

import { revokeEntitlement } from "@/modules/access"
import type { Result, TxContext } from "@/modules/_shared"
import type { Enrollment, Order } from "@/payload-types"

import { getStripe } from "../server/stripe-port"
import { withTransaction, type SqlExecutor } from "../server/tx"
import type { ExecuteSeatCancellationInput, SeatCancellationResult } from "../types"
import { findOrderById } from "../webhook/orders"
import { requestOrderRefund } from "../webhook/refund"
import { insertCreditCode, type CreatedCredit } from "./credit"
import { seatCancellationCap, seatsOfOrder } from "./cap"
import { fail, idSchema, invalid, relNum, seatLog, zodFail } from "./shared"

const inputSchema = z
  .object({
    enrollmentId: idSchema,
    outcome: z.enum(["refund", "credit", "none"]),
    amount: z.number().int().min(0).max(10_000_000),
    by: z.enum(["customer", "staff"]),
    actorId: idSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .refine((v) => v.outcome !== "none" || v.amount === 0, { path: ["amount"], message: "AMOUNT_MUST_BE_ZERO_FOR_NONE" })

type Input = z.infer<typeof inputSchema>

/** Stripe idempotency key of a seat refund: one refund per seat, retries included. */
export const seatRefundKey = (enrollmentId: number) => `seat-cancel-${enrollmentId}`

// ---------- test-only fault injection (rollback tests) ----------

type SeatFault = (stage: "after-credit-insert") => void
let fault: SeatFault | null = null

/** Test-only. Throwing from `fn` aborts the cancellation transaction at `stage`. */
export function setSeatFaultForTests(fn: SeatFault | null): void {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) throw new Error("setSeatFaultForTests is test-only")
  fault = fn
}

// ---------- phase 1: the database transaction ----------

/** The decision that is executed: on a retry it is the PERSISTED one, never the caller's input. */
type Decision = { outcome: Input["outcome"]; amount: number }

type Plan =
  | { kind: "error"; result: Result<never> }
  | { kind: "cancelled"; orderId: number; paymentIntentId: string | null; credit: CreatedCredit | null; decision: Decision }
  | { kind: "retry"; orderId: number; paymentIntentId: string | null; decision: Decision }

const isRefundable = (o: Order) => (o.status === "paid" || o.status === "partially_refunded") && Boolean(o.stripePaymentIntentId)

const hasLinkedRefund = (o: Order, enrollmentId: number) => (o.refunds ?? []).some((r) => relNum(r.enrollment) === enrollmentId)

async function lockRow(db: SqlExecutor, table: "enrollments" | "orders", id: number): Promise<boolean> {
  const { rows } =
    table === "enrollments"
      ? await db.execute(sql`SELECT id FROM enrollments WHERE id = ${id} FOR UPDATE`)
      : await db.execute(sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`)
  return rows.length > 0
}

async function cancelSeat(i: Input, e: Enrollment, order: Order, tx: TxContext): Promise<CreatedCredit | null> {
  const payload = tx.req.payload
  await payload.update({
    collection: "enrollments",
    id: e.id,
    data: { status: "cancelled", cancelledAt: new Date().toISOString(), cancellationOutcome: i.outcome, cancellationAmount: i.amount },
    depth: 0,
    overrideAccess: true,
    req: tx.req,
  })

  const courseId = relNum(order.items?.[0]?.course)
  const attendeeId = relNum(e.customer)
  if (courseId !== null && attendeeId !== null) {
    const r = await revokeEntitlement({
      customerId: attendeeId,
      courseId,
      source: "purchase",
      sourceRef: String(order.id),
      reason: `seat-cancel:${i.by}`,
      tx,
    })
    if (!r.ok && r.error.code !== "NOT_FOUND") throw new Error(`[commerce] revokeEntitlement failed: ${r.error.code}`)
    if (!r.ok) seatLog("warn", "commerce.seat.entitlement_missing", { enrollmentId: e.id, orderId: order.id })
  }

  if (i.outcome !== "credit" || i.amount === 0) return null
  const buyerId = relNum(order.customer)
  if (buyerId === null) throw new Error("[commerce] order has no buyer")
  const credit = await insertCreditCode({ customerId: buyerId, amount: i.amount, reason: i.reason, tx })
  fault?.("after-credit-insert")
  return credit
}

/**
 * A seat cancelled with outcome `refund` and a positive persisted amount whose
 * refund never got linked: the Stripe call failed (or is in flight). The
 * persisted amount wins over the caller's (L-2); legacy rows (no amount) use the input.
 */
function pendingRefundAmount(e: Enrollment, order: Order, i: Input): number | null {
  if (e.status !== "cancelled" || e.cancellationOutcome !== "refund" || hasLinkedRefund(order, Number(e.id))) return null
  const persisted = e.cancellationAmount
  const amount = persisted === null || persisted === undefined ? (i.outcome === "refund" ? i.amount : 0) : Number(persisted)
  return amount > 0 ? amount : null
}

/** Lock order + enrollment → cap (M-2) → cancel (or recognise a pending-refund retry). Commits on return. */
function planCancellation(i: Input): Promise<Plan> {
  return withTransaction(async ({ db, tx }) => {
    const id = i.enrollmentId
    if (!(await lockRow(db, "enrollments", id))) return { kind: "error", result: fail({ code: "NOT_FOUND", entity: "enrollment" }) }
    const payload = tx.req.payload
    const e = (await payload.findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true, req: tx.req })) as Enrollment
    const orderId = relNum(e.order)
    // Serialize every seat of one order: the order-level cap must see sibling decisions.
    if (orderId === null || !(await lockRow(db, "orders", orderId))) return { kind: "error", result: fail({ code: "NOT_FOUND", entity: "order" }) }
    const order = await findOrderById(payload, orderId, tx.req)
    if (!order) return { kind: "error", result: fail({ code: "NOT_FOUND", entity: "order" }) }

    const { cap, seatRemaining } = seatCancellationCap(order, await seatsOfOrder(orderId, tx.req), id)
    const base = { orderId: Number(order.id), paymentIntentId: order.stripePaymentIntentId ?? null }

    if (e.status === "confirmed") {
      if (i.amount > seatRemaining) return { kind: "error", result: invalid("amount", "AMOUNT_EXCEEDS_SEAT") }
      if (i.amount > cap) return { kind: "error", result: invalid("amount", "AMOUNT_EXCEEDS_REFUNDABLE") }
      if (i.outcome === "refund" && i.amount > 0 && !isRefundable(order)) {
        return { kind: "error", result: fail({ code: "CONFLICT", reason: "ORDER_NOT_REFUNDABLE" }) }
      }
      const credit = await cancelSeat(i, e, order, tx)
      return { kind: "cancelled", ...base, credit, decision: { outcome: i.outcome, amount: i.amount } }
    }
    const pending = pendingRefundAmount(e, order, i)
    if (pending !== null) {
      // The seat's own pending promise is not in `cap` (only siblings' are), so this re-checks the
      // order after Dashboard refunds made since the failure.
      if (pending > cap) return { kind: "error", result: fail({ code: "CONFLICT", reason: "AMOUNT_EXCEEDS_REFUNDABLE" }) }
      return { kind: "retry", ...base, decision: { outcome: "refund", amount: pending } }
    }
    return { kind: "error", result: fail({ code: "CONFLICT", reason: "SEAT_NOT_CONFIRMED" }) }
  })
}

// ---------- phase 2: Stripe, after commit ----------

const COUNTED = new Set(["succeeded", "pending", "requires_action"])

/** Has Stripe already got a live refund for this seat? (retry de-duplication) */
async function seatRefundExists(paymentIntentId: string, enrollmentId: number): Promise<boolean> {
  const { data } = await getStripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 })
  return data.some((r) => r.metadata?.enrollmentId === String(enrollmentId) && COUNTED.has(String(r.status)))
}

async function requestSeatRefund(i: Input, plan: Extract<Plan, { kind: "cancelled" | "retry" }>): Promise<Result<void>> {
  const amount = plan.decision.amount
  if (plan.kind === "retry") {
    if (!plan.paymentIntentId) return fail({ code: "CONFLICT", reason: "ORDER_NOT_REFUNDABLE" })
    try {
      if (await seatRefundExists(plan.paymentIntentId, i.enrollmentId)) {
        return fail({ code: "CONFLICT", reason: "REFUND_ALREADY_REQUESTED" })
      }
    } catch (error) {
      seatLog("error", "commerce.seat.refund_lookup_failed", { enrollmentId: i.enrollmentId, orderId: plan.orderId })
      return fail({ code: "UPSTREAM", service: "stripe", message: error instanceof Error ? error.message : "stripe error" })
    }
  }
  const r = await requestOrderRefund(
    { orderId: plan.orderId, amount, reason: i.reason, enrollmentId: i.enrollmentId },
    { idempotencyKey: seatRefundKey(i.enrollmentId) },
  )
  if (!r.ok) {
    seatLog("error", "commerce.seat.refund_failed", { enrollmentId: i.enrollmentId, orderId: plan.orderId, code: r.error.code, retry: plan.kind === "retry" })
  }
  return r
}

/** Serialize every call for one enrollment (cancel + refund) on a transaction-scoped advisory lock. */
function withSeatGuard<T>(enrollmentId: number, fn: () => Promise<T>): Promise<T> {
  return withTransaction(async ({ db }) => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cff_seat:${enrollmentId}`}, 0))`)
    return fn()
  })
}

/**
 * CONTRACT §4 `executeSeatCancellation` (CCR-W3-4). Commerce executes the
 * outcome scheduling decided; it never reads the cancellation policy.
 *
 * tx (lock enrollment + order, must be `confirmed`, amount ≤ cap (M-2: seat AND
 * order remaining, Dashboard refunds included), mark cancelled + outcome + amount, revoke the
 * attendee's purchase entitlement, credit row for the BUYER) → commit → Stripe
 * refund with idempotency key `seat-cancel-<enrollmentId>`. Stripe failure →
 * UPSTREAM with the seat left cancelled; re-calling retries the refund only, with
 * the PERSISTED amount (L-2) whatever the caller passes.
 * Calls for one enrollment are serialized, so a concurrent duplicate gets CONFLICT.
 */
export async function executeSeatCancellation(i: ExecuteSeatCancellationInput): Promise<Result<SeatCancellationResult>> {
  const parsed = inputSchema.safeParse(i)
  if (!parsed.success) return zodFail(parsed.error)
  const input = parsed.data

  return withSeatGuard(input.enrollmentId, async () => {
    const plan = await planCancellation(input)
    if (plan.kind === "error") return plan.result

    if (plan.kind === "cancelled") {
      seatLog("info", "commerce.seat.cancelled", {
        enrollmentId: input.enrollmentId,
        orderId: plan.orderId,
        outcome: input.outcome,
        amount: input.amount,
        by: input.by,
        actorId: input.actorId,
      })
    }

    const { decision } = plan
    const wantsRefund = decision.outcome === "refund" && decision.amount > 0
    if (wantsRefund) {
      const r = await requestSeatRefund(input, plan)
      if (!r.ok) return r
    }
    const credit = plan.kind === "cancelled" ? plan.credit : null
    return {
      ok: true,
      data: {
        enrollmentStatus: "cancelled",
        refundRequested: wantsRefund,
        outcome: decision.outcome,
        amount: decision.amount,
        retry: plan.kind === "retry",
        ...(credit ? { creditCode: credit.code, creditExpiresAt: credit.expiresAt } : {}),
      },
    }
  })
}
