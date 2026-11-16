/**
 * W4-04 — capture helpers. All no-ops without a DSN (Sentry.captureException is a
 * no-op when the SDK was never initialised). No payloads, no recipients.
 * Error messages go through safeErrorFields (W4-03b) so Stripe errors never echo params.
 */
import * as Sentry from "@sentry/nextjs"

// Pure helper (no imports); deep import avoids a commerce<->notifications cycle via the module index.
// eslint-disable-next-line no-restricted-imports
import { safeErrorFields } from "@/modules/commerce/server/log-error"
import { scrubString } from "./scrub"

function toSafeError(err: unknown): Error {
  const f = safeErrorFields(err)
  const message = scrubString(f.message ?? ([f.type, f.code, f.param].filter(Boolean).join(":") || "unknown error"))
  const safe = new Error(message)
  safe.name = f.name ?? f.type ?? "Error"
  return safe
}

export function captureWebhookError(
  source: "stripe" | "mux" | "bunny",
  err: unknown,
  ctx: { eventId?: string; eventType?: string } = {},
): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error")
    scope.setTag("webhook", source)
    scope.setTag("alert", `webhook:${source}`)
    if (ctx.eventId) scope.setTag("event_id", ctx.eventId)
    if (ctx.eventType) scope.setTag("event_type", ctx.eventType)
    scope.setFingerprint(["webhook", source, ctx.eventType ?? "unknown"])
    Sentry.captureException(toSafeError(err))
  })
}

export function captureCronFailure(route: string, err: unknown): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error")
    scope.setTag("cron", route)
    scope.setTag("alert", `cron:${route}`)
    scope.setFingerprint(["cron", route])
    Sentry.captureException(toSafeError(err))
  })
}

export function captureJobFailure(task: string, ctx: { idempotencyKey?: string } = {}, err?: unknown): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error")
    scope.setTag("job", task)
    scope.setTag("alert", `job:${task}`)
    if (ctx.idempotencyKey) scope.setTag("idempotency_key", ctx.idempotencyKey)
    scope.setFingerprint(["job", task])
    Sentry.captureException(toSafeError(err ?? new Error(`${task} failed after final retry`)))
  })
}
