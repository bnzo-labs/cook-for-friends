import { sql } from "@payloadcms/db-postgres/drizzle"
import type { TaskConfig } from "payload"
import { z } from "zod"

import type { ID } from "@/modules/_shared"
import { getSessionView, type SessionView } from "@/modules/catalog"
import { executeSeatCancellation, getEnrollmentView, listAttendees, type EnrollmentView } from "@/modules/commerce"

import { enqueueCancellationEmails, fullRefundDecision, isPendingRefund } from "./cancel"
import { withTransaction } from "./tx"

/** Payload job slug (scheduling-owned). Queued by the `sessions` afterChange hook (catalog, by slug). */
export const SESSION_CANCEL_TASK = "session-cancel"

const idSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,9}$/)]).transform(Number)
const inputSchema = z.object({ sessionId: idSchema, actorId: idSchema })

export type SessionCancelFailure = { enrollmentId: number; code: string; reason?: string }

export type SessionCancelSummary = {
  /** `not-cancelled`: the session is no longer `cancelled` (flipped back) → nothing more is done. */
  status: "done" | "not-cancelled" | "unavailable"
  /** Seats cancelled now with a refund. */
  refunded: number[]
  /** Seats cancelled now with nothing left to refund (M-2 cap 0, e.g. Dashboard refund, free order). */
  none: number[]
  /** Seats whose earlier refund had failed at Stripe, retried now. */
  retried: number[]
  failed: SessionCancelFailure[]
  /** At least one failure is transient (Stripe/DB): the job must run again. */
  retryable: boolean
  waitlistExpired: number
}

type Log = "info" | "warn" | "error"
function log(level: Log, event: string, fields: Record<string, unknown>): void {
  // No PII: ids, codes and counts only.
  console[level](JSON.stringify({ level, event, ...fields }))
}

const empty = (status: SessionCancelSummary["status"]): SessionCancelSummary => ({
  status,
  refunded: [],
  none: [],
  retried: [],
  failed: [],
  retryable: false,
  waitlistExpired: 0,
})

/** Re-read every seat: a staff flip back to `scheduled` stops the run between two seats. */
async function stillCancelled(sessionId: number): Promise<SessionView | null> {
  const view = await getSessionView(sessionId, "fr")
  return view && view.status === "cancelled" ? view : null
}

type SeatOutcome =
  | { kind: "skip" }
  | { kind: "done"; bucket: "refunded" | "none" | "retried" }
  | { kind: "failed"; failure: SessionCancelFailure; transient: boolean }

const TRANSIENT = new Set(["UPSTREAM", "INTERNAL"])

async function cancelOneSeat(view: EnrollmentView, session: SessionView, actorId: number): Promise<SeatOutcome> {
  const enrollmentId = Number(view.id)
  const retry = isPendingRefund(view)
  if (view.status !== "confirmed" && !retry) return { kind: "skip" }

  let decision: { outcome: "refund" | "none"; amount: number }
  if (retry) {
    // L-2: commerce replays the persisted amount whatever we pass.
    decision = { outcome: "refund", amount: view.cancellationAmount ?? 0 }
  } else {
    const full = await fullRefundDecision(enrollmentId)
    if (!full.ok) return { kind: "failed", failure: { enrollmentId, code: full.error.code }, transient: false }
    decision = full.data
  }

  const done = await executeSeatCancellation({
    enrollmentId,
    outcome: decision.outcome,
    amount: decision.amount,
    by: "staff",
    actorId,
    reason: `session-cancelled:${session.id}`,
  })

  if (!done.ok) {
    // Refund already at Stripe, not yet linked by `charge.refunded` (earlier run or a concurrent
    // one): nothing to do, and no second email.
    if (done.error.code === "CONFLICT" && done.error.reason === "REFUND_ALREADY_REQUESTED") return { kind: "skip" }
    const reason = done.error.code === "CONFLICT" ? done.error.reason : undefined
    return {
      kind: "failed",
      failure: { enrollmentId, code: done.error.code, ...(reason ? { reason } : {}) },
      transient: TRANSIENT.has(done.error.code),
    }
  }
  const { outcome, amount } = done.data
  try {
    await enqueueCancellationEmails(
      view,
      session,
      { outcome, amount },
      { keyPrefix: "session-cancel", reason: "session-cancelled" },
    )
  } catch (error) {
    // Money moved and the seat is cancelled: never undo over a notice. Logged for staff follow-up.
    log("error", "scheduling.session_cancel.email_failed", { enrollmentId, message: error instanceof Error ? error.message : String(error) })
  }
  if (retry) return { kind: "done", bucket: "retried" }
  return { kind: "done", bucket: outcome === "refund" && amount > 0 ? "refunded" : "none" }
}

/** Waitlist of a cancelled session: `waiting`/`notified` → `expired` (no email). */
async function expireWaitlist(sessionId: number): Promise<number> {
  return withTransaction(async ({ db }) => {
    const { rows } = await db.execute(
      sql`UPDATE waitlist_entries SET status = 'expired', updated_at = now()
          WHERE session_id = ${sessionId} AND status IN ('waiting', 'notified') RETURNING id`,
    )
    return rows.length
  })
}

/**
 * W4-07. Staff cancelled a session → every seat gets a FULL refund of its remaining
 * refundable amount (M-2 cap, Dashboard refunds respected), outside the D1 tiers.
 *
 * Seats are processed ONE AT A TIME (W3-10 L-12: each cancel holds 2 pooled connections).
 * Idempotent and resumable: done seats are skipped; seats whose refund failed earlier are
 * retried with the persisted amount (L-2); Stripe idempotency key stays `seat-cancel-<id>`;
 * emails keyed `session-cancel-<id>-{buyer,attendee}`. The session is re-read before each
 * seat: once it is no longer `cancelled`, the run stops (flip back never refunds more).
 */
export async function cancelSessionSeats(i: { sessionId: ID; actorId: ID }): Promise<SessionCancelSummary> {
  const { sessionId, actorId } = inputSchema.parse(i)
  const first = await getSessionView(sessionId, "fr")
  if (!first) {
    log("error", "scheduling.session_cancel.session_unavailable", { sessionId })
    return empty("unavailable")
  }
  if (first.status !== "cancelled") return empty("not-cancelled")

  const summary = empty("done")
  const ids = (await listAttendees(sessionId)).map((r) => Number(r.enrollmentId)).sort((a, b) => a - b)
  for (const enrollmentId of ids) {
    const session = await stillCancelled(sessionId)
    if (!session) {
      log("warn", "scheduling.session_cancel.stopped", { sessionId, reason: "status-changed" })
      return { ...summary, status: "not-cancelled" }
    }
    const view = await getEnrollmentView(enrollmentId)
    if (!view) continue
    let r: SeatOutcome
    try {
      r = await cancelOneSeat(view, session, actorId)
    } catch (error) {
      log("error", "scheduling.session_cancel.seat_threw", { sessionId, enrollmentId, message: error instanceof Error ? error.message : String(error) })
      r = { kind: "failed", failure: { enrollmentId, code: "INTERNAL" }, transient: true }
    }
    if (r.kind === "done") summary[r.bucket].push(enrollmentId)
    if (r.kind === "failed") {
      summary.failed.push(r.failure)
      summary.retryable = summary.retryable || r.transient
      log(r.transient ? "warn" : "error", "scheduling.session_cancel.seat_failed", { sessionId, ...r.failure, transient: r.transient })
    }
  }
  const waitlistExpired = await expireWaitlist(sessionId)
  log("info", "scheduling.session_cancel.run", {
    sessionId,
    refunded: summary.refunded.length,
    none: summary.none.length,
    retried: summary.retried.length,
    failed: summary.failed.length,
    waitlistExpired,
  })
  return { ...summary, waitlistExpired }
}

/** Payload task: throws while a seat is retryable, so Payload retries with backoff (resume). */
export const sessionCancelTask: TaskConfig<"session-cancel"> = {
  slug: SESSION_CANCEL_TASK,
  label: "Session cancelled: refund every seat",
  retries: { attempts: 8, backoff: { type: "exponential", delay: 60_000 } },
  inputSchema: [
    { name: "sessionId", type: "number", required: true },
    { name: "actorId", type: "number", required: true },
  ],
  handler: async ({ input }) => {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) throw new Error(`${SESSION_CANCEL_TASK}: invalid input`)
    const r = await cancelSessionSeats(parsed.data)
    if (r.retryable) {
      throw new Error(`${SESSION_CANCEL_TASK}: ${r.failed.length} seat(s) pending retry on session ${parsed.data.sessionId}`)
    }
    return { output: {} }
  },
}
