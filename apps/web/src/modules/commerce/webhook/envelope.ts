import { sql } from "@payloadcms/db-postgres/drizzle"
import Stripe from "stripe"

import type { Result } from "@/modules/_shared"
import { onSeatReleased } from "@/modules/scheduling"

import { getPayload } from "../server/payload"
import { executorFor, withTransaction, type SqlExecutor } from "../server/tx"
import { asyncFailedHandler, expiredHandler } from "./handlers/checkout-closed"
import { chargeRefundedHandler } from "./handlers/charge-refunded"
import { applyCompleted } from "./handlers/completed-apply"
import { prepareCompleted } from "./handlers/completed-prepare"
import { invoiceFinalizedHandler } from "./handlers/invoice-finalized"
import { logEvent, type ApplyResult, type EventHandler, type Outcome } from "./shared"

/** Missing `STRIPE_WEBHOOK_SECRET`: fail closed (route → 500 + error log). */
export class WebhookConfigError extends Error {
  constructor() {
    super("STRIPE_WEBHOOK_SECRET is not set")
    this.name = "WebhookConfigError"
  }
}

const completedHandler: EventHandler<Awaited<ReturnType<typeof prepareCompleted>>> = {
  prepare: prepareCompleted,
  apply: applyCompleted,
}

const HANDLERS: Record<string, EventHandler<unknown> | undefined> = {
  "checkout.session.completed": completedHandler as EventHandler<unknown>,
  "checkout.session.async_payment_succeeded": completedHandler as EventHandler<unknown>,
  "checkout.session.async_payment_failed": asyncFailedHandler as EventHandler<unknown>,
  "checkout.session.expired": expiredHandler as EventHandler<unknown>,
  "charge.refunded": chargeRefundedHandler as EventHandler<unknown>,
  "invoice.finalized": invoiceFinalizedHandler as EventHandler<unknown>,
}

export const HANDLED_EVENT_TYPES = Object.keys(HANDLERS)

/** Test-only fault injection: runs inside the transaction after the handler. */
let fault: ((event: Stripe.Event) => void) | null = null
export function setWebhookFaultForTests(fn: ((event: Stripe.Event) => void) | null): void {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) throw new Error("setWebhookFaultForTests is test-only")
  fault = fn
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const db = await executorFor()
  const { rows } = await db.execute<{ id: number }>(sql`SELECT id FROM processed_stripe_events WHERE event_id = ${eventId}`)
  return rows.length > 0
}

/** Ledger insert. A concurrent duplicate waits on the unique index, then gets no row. */
async function claimEvent(db: SqlExecutor, event: Stripe.Event): Promise<boolean> {
  const { rows } = await db.execute<{ id: number }>(sql`
    INSERT INTO processed_stripe_events (event_id, type, processed_at, outcome)
    VALUES (${event.id}, ${event.type}, now(), 'applied')
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id
  `)
  return rows.length > 0
}

async function recordOutcome(db: SqlExecutor, eventId: string, r: ApplyResult): Promise<void> {
  await db.execute(sql`
    UPDATE processed_stripe_events SET outcome = ${r.outcome}, note = ${r.note ?? null}, updated_at = now()
    WHERE event_id = ${eventId}
  `)
}

/** Best-effort email delivery right after the response; cron `/api/cron/jobs` is the fallback. */
async function scheduleJobsRun(): Promise<void> {
  try {
    const { after } = await import("next/server")
    after(async () => {
      try {
        const payload = await getPayload()
        await payload.jobs.run({ limit: 20 })
      } catch (error) {
        console.error("[commerce] webhook: post-commit jobs.run failed", error)
      }
    })
  } catch {
    // Outside a request scope (tests, scripts): leave the jobs to the cron.
  }
}

async function runAfterCommit(r: ApplyResult): Promise<void> {
  for (const sessionId of new Set(r.after?.releasedSessionIds ?? [])) await onSeatReleased(sessionId)
  if (r.after?.queuedEmails) await scheduleJobsRun()
}

/** CONTRACT §6 envelope for an already verified event. */
export async function processStripeEvent(event: Stripe.Event): Promise<{ outcome: Outcome }> {
  if (await alreadyProcessed(event.id)) return { outcome: "skipped" }
  const handler = HANDLERS[event.type]
  const prepared = handler ? await handler.prepare(event) : null

  const result = await withTransaction(async (scope) => {
    if (!(await claimEvent(scope.db, event))) return null
    const r: ApplyResult = handler ? await handler.apply(prepared, scope, event) : { outcome: "skipped", note: "unhandled event type" }
    fault?.(event)
    await recordOutcome(scope.db, event.id, r)
    return r
  })
  if (!result) return { outcome: "skipped" }
  logEvent("info", "webhook.processed", { eventId: event.id, type: event.type, outcome: result.outcome })
  await runAfterCommit(result)
  return { outcome: result.outcome }
}

/**
 * CONTRACT §4 `handleStripeEvent`. Bad signature → VALIDATION (route 400).
 * Missing secret → throws `WebhookConfigError`; handler failures throw (route 500, Stripe retries).
 */
export async function handleStripeEvent(rawBody: string, signature: string): Promise<Result<{ outcome: Outcome }>> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    logEvent("error", "webhook.secret.missing")
    throw new WebhookConfigError()
  }
  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    logEvent("warn", "webhook.signature.invalid")
    return { ok: false, error: { code: "VALIDATION", issues: [{ path: "stripe-signature", message: "SIGNATURE_INVALID" }] } }
  }
  try {
    return { ok: true, data: await processStripeEvent(event) }
  } catch (error) {
    logEvent("error", "webhook.handler.failed", { eventId: event.id, type: event.type, message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
