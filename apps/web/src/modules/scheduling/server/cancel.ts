import { z } from "zod"

import type { ID, Locale, Result } from "@/modules/_shared"
import { getCancellationPolicy, getSessionView, type SessionView } from "@/modules/catalog"
import { executeSeatCancellation, getEnrollmentView, getSeatCancellationCap, type EnrollmentView } from "@/modules/commerce"
import { enqueueEmail } from "@/modules/notifications"

import { evaluateTiers, effectiveTiers, hoursBetween } from "./policy"
import { getPayload } from "./payload"
import { onSeatReleased } from "./seat-released"
import { withTransaction } from "./tx"

export type CancelReason = "NOT_BUYER" | "SELF_CANCEL_DISABLED" | "SESSION_STARTED" | "NOT_CONFIRMED"

export type CancellationPreview = {
  allowed: boolean
  reason?: CancelReason
  outcome: "refund" | "credit" | "none"
  percent: number
  amount: number
  hoursBefore: number
  /** ISO instant after which the outcome gets worse (current tier's lower bound). */
  deadlineNextTier?: string
}

const idSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,9}$/)])
const cancelSchema = z.object({ enrollmentId: idSchema, by: z.enum(["customer", "staff"]), actorId: idSchema })

const fail = (error: Extract<Result<never>, { ok: false }>["error"]): Result<never> => ({ ok: false, error })
const same = (a: ID, b: ID) => String(a) === String(b)

type Actor = { kind: "customer"; id: ID } | { kind: "staff" } | { kind: "any" }

/** A seat whose cancellation committed but whose Stripe refund never got requested. */
const isPendingRefund = (v: EnrollmentView): boolean =>
  v.status === "cancelled" &&
  v.cancellationOutcome === "refund" &&
  v.refundedAmount === 0 &&
  (v.cancellationAmount === null || v.cancellationAmount > 0)

type Decision = { outcome: CancellationPreview["outcome"]; amount: number }

/**
 * W4-03b (M-2): the policy amount never exceeds what is still refundable on the
 * seat AND the order (Dashboard refunds included). Clamped to 0 → outcome `none`.
 * A retry shows the persisted decision (L-2); commerce replays it anyway.
 */
async function applyCap(view: EnrollmentView, d: Decision, retry: boolean): Promise<Decision> {
  if (retry && view.cancellationAmount !== null) return { outcome: "refund", amount: view.cancellationAmount }
  if (retry || d.amount === 0) return d
  const cap = await getSeatCancellationCap(view.id)
  if (!cap.ok) return d
  const amount = Math.min(d.amount, cap.data.cap)
  return { outcome: amount === 0 ? "none" : d.outcome, amount }
}

type Evaluated = { preview: CancellationPreview; session: SessionView | null; retry: boolean }

async function evaluate(view: EnrollmentView, actor: Actor, now: Date): Promise<Evaluated> {
  const [session, policy] = await Promise.all([getSessionView(view.sessionId, "fr"), getCancellationPolicy()])
  const retry = isPendingRefund(view)
  // A retry must reproduce the original decision: evaluate at the moment the seat was cancelled.
  const at = retry && view.cancelledAt ? new Date(view.cancelledAt) : now
  const startsAt = session ? new Date(session.startsAt) : null
  const hoursBefore = startsAt ? hoursBetween(at, startsAt) : 0
  const result = evaluateTiers(effectiveTiers(policy.tiers), hoursBefore, view.seatAmount)
  const decided = await applyCap(view, { outcome: result.outcome, amount: result.amount }, retry)
  const preview: CancellationPreview = {
    allowed: true,
    outcome: decided.outcome,
    percent: result.percent,
    amount: decided.amount,
    hoursBefore,
  }
  if (result.tierMinHours !== null && result.tierMinHours > 0 && startsAt) {
    preview.deadlineNextTier = new Date(startsAt.getTime() - result.tierMinHours * 3_600_000).toISOString()
  }
  const deny = (reason: CancelReason): Evaluated => ({ preview: { ...preview, allowed: false, reason }, session, retry })

  if (actor.kind === "customer" && !same(view.buyerCustomerId, actor.id)) return deny("NOT_BUYER")
  if (actor.kind !== "staff" && !policy.customerCanSelfCancel) return deny("SELF_CANCEL_DISABLED")
  if (view.status !== "confirmed" && !retry) return deny("NOT_CONFIRMED")
  const open = session !== null && session.status === "scheduled" && startsAt !== null && startsAt.getTime() > now.getTime()
  if (actor.kind !== "staff" && !open && !retry) return deny("SESSION_STARTED")
  if (!session) return deny("SESSION_STARTED")
  return { preview, session, retry }
}

/**
 * CONTRACT §4 `previewCancellation` (CCR-W3-5). Pure read; rendered by the portal.
 * With `actorCustomerId`, that customer must be the buyer of the seat.
 */
export async function previewCancellation(i: { enrollmentId: ID; actorCustomerId?: ID }): Promise<Result<CancellationPreview>> {
  const parsed = z.object({ enrollmentId: idSchema, actorCustomerId: idSchema.optional() }).safeParse(i)
  if (!parsed.success) return fail({ code: "VALIDATION", issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) })
  const view = await getEnrollmentView(parsed.data.enrollmentId)
  if (!view) return fail({ code: "NOT_FOUND", entity: "enrollment" })
  const actor: Actor = parsed.data.actorCustomerId !== undefined ? { kind: "customer", id: parsed.data.actorCustomerId } : { kind: "any" }
  const { preview } = await evaluate(view, actor, new Date())
  return { ok: true, data: preview }
}

type Person = { email: string; locale: Locale; name: string }

async function personOf(customerId: ID): Promise<Person | null> {
  const payload = await getPayload()
  const c = await payload.findByID({ collection: "customers", id: customerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!c) return null
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  return { email: c.email, locale: c.preferredLocale === "en" ? "en" : "fr", name: name || c.email }
}

/** Buyer gets amounts + credit code; a guest attendee (≠ buyer) gets a plain notice. Keys make retries safe. */
async function enqueueCancellationEmails(
  view: EnrollmentView,
  session: SessionView,
  data: { outcome: "refund" | "credit" | "none"; amount: number; creditCode?: string; creditExpiresAt?: string },
): Promise<void> {
  const [buyer, attendee] = await Promise.all([
    personOf(view.buyerCustomerId),
    same(view.attendeeCustomerId, view.buyerCustomerId) ? Promise.resolve(null) : personOf(view.attendeeCustomerId),
  ])
  const attendeeName = view.attendeeName ?? attendee?.name ?? buyer?.name ?? ""
  const base = { attendeeName, courseTitle: session.courseTitle, sessionStartsAt: session.startsAt, currency: "cad" as const }
  await withTransaction(async ({ tx }) => {
    if (buyer) {
      await enqueueEmail({
        template: "cancellation-confirmation",
        to: buyer.email,
        locale: buyer.locale,
        idempotencyKey: `cancel-${view.id}-buyer`,
        data: {
          ...base,
          recipient: "buyer",
          outcome: data.outcome,
          amount: data.amount,
          orderNumber: view.orderNumber,
          ...(data.creditCode ? { creditCode: data.creditCode } : {}),
          ...(data.creditExpiresAt ? { creditExpiresAt: data.creditExpiresAt } : {}),
        },
        tx,
      })
    }
    if (attendee) {
      await enqueueEmail({
        template: "cancellation-confirmation",
        to: attendee.email,
        locale: attendee.locale,
        idempotencyKey: `cancel-${view.id}-attendee`,
        data: { ...base, recipient: "attendee", outcome: data.outcome, amount: 0 },
        tx,
      })
    }
  })
}

/**
 * CONTRACT §4 `cancelEnrollment` (CCR-W3-5). Policy decides, commerce executes.
 * Customer actor must be the seat's buyer (Q11); staff may cancel any time (outcome still
 * follows the policy). UPSTREAM (Stripe) leaves the seat cancelled: call again to retry the refund.
 */
export async function cancelEnrollment(i: {
  enrollmentId: ID
  by: "customer" | "staff"
  actorId: ID
}): Promise<Result<{ outcome: "refund" | "credit" | "none"; amount: number }>> {
  const parsed = cancelSchema.safeParse(i)
  if (!parsed.success) return fail({ code: "VALIDATION", issues: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) })
  const { enrollmentId, by, actorId } = parsed.data

  const view = await getEnrollmentView(enrollmentId)
  if (!view) return fail({ code: "NOT_FOUND", entity: "enrollment" })

  const actor: Actor = by === "staff" ? { kind: "staff" } : { kind: "customer", id: actorId }
  const { preview, session, retry } = await evaluate(view, actor, new Date())
  if (!preview.allowed || !session) {
    return fail(
      preview.reason === "NOT_BUYER" || preview.reason === "SELF_CANCEL_DISABLED"
        ? { code: "FORBIDDEN" }
        : { code: "CONFLICT", reason: preview.reason ?? "NOT_CONFIRMED" },
    )
  }

  const done = await executeSeatCancellation({
    enrollmentId,
    outcome: preview.outcome,
    amount: preview.amount,
    by,
    actorId,
    reason: `${by}-cancel:${preview.outcome}`,
  })
  if (!done.ok) {
    // L-2: UPSTREAM = the seat committed `cancelled` but the Stripe refund failed. The seat is
    // free now, so the waitlist hears about it; emails wait for the successful retry (sent once).
    if (done.error.code === "UPSTREAM") await releaseQuietly(view.sessionId, enrollmentId)
    return done
  }
  const { outcome, amount } = done.data

  try {
    await enqueueCancellationEmails(
      view,
      session,
      {
        outcome,
        amount,
        ...(done.data.creditCode ? { creditCode: done.data.creditCode } : {}),
        ...(done.data.creditExpiresAt ? { creditExpiresAt: done.data.creditExpiresAt } : {}),
      },
    )
  } catch (error) {
    // The seat is already cancelled and money moved: never fail the call over a notice.
    console.error("[scheduling] cancellation emails failed", {
      enrollmentId,
      retry,
      message: error instanceof Error ? error.message : String(error),
    })
  }
  await releaseQuietly(view.sessionId, enrollmentId)
  return { ok: true, data: { outcome, amount } }
}

/** `onSeatReleased` is idempotent (conditional claims); a waitlist failure never fails the cancel. */
async function releaseQuietly(sessionId: ID, enrollmentId: ID): Promise<void> {
  try {
    await onSeatReleased(sessionId)
  } catch (error) {
    console.error("[scheduling] onSeatReleased failed after cancel", {
      enrollmentId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
