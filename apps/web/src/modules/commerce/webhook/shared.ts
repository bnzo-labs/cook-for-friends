import type Stripe from "stripe"
import { z } from "zod"

import type { ID, Locale, TxContext } from "@/modules/_shared"

import type { SqlExecutor } from "../server/tx"

/** Outcome recorded in `processed-stripe-events` and returned by `handleStripeEvent`. */
export type Outcome = "applied" | "skipped" | "refunded"

/** Side effects that run only after the transaction committed. */
export type AfterCommit = { releasedSessionIds: number[]; queuedEmails: boolean }

export type ApplyResult = { outcome: Outcome; note?: string; after?: Partial<AfterCommit> }

export type ApplyScope = { db: SqlExecutor; tx: TxContext }

/**
 * A webhook handler in two phases (CONTRACT §6): `prepare` runs BEFORE the
 * transaction (Stripe reads, customer upserts); `apply` runs inside it.
 */
export type EventHandler<P> = {
  prepare: (event: Stripe.Event) => Promise<P>
  apply: (prepared: P, scope: ApplyScope, event: Stripe.Event) => Promise<ApplyResult>
}

export const relId = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "object") return Number((v as { id: ID }).id)
  return Number(v)
}

export const stripeId = (v: string | { id: string } | null | undefined): string | null =>
  v === null || v === undefined ? null : typeof v === "string" ? v : v.id

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  return new URL(raw).origin
}

const idString = z.string().regex(/^\d+$/, "numeric id")

/** Keys written by W2-04 `buildSessionParams` (CheckoutMetadata). */
export const checkoutMetadataSchema = z.object({
  cartToken: z.string().min(1),
  holdId: idString.optional(),
  courseId: idString,
  sessionId: idString.optional(),
  locale: z.enum(["fr", "en"]),
  quantity: z.string().regex(/^[1-9]\d*$/),
})

export type ParsedMetadata = {
  cartToken: string
  holdId: number | null
  courseId: number
  sessionId: number | null
  locale: Locale
  quantity: number
}

/** Never trust a malformed metadata block: throw → 500 → logged, Stripe retries. */
export function parseCheckoutMetadata(metadata: Stripe.Metadata | null | undefined, context: string): ParsedMetadata {
  const parsed = checkoutMetadataSchema.safeParse(metadata ?? {})
  if (!parsed.success) {
    console.error(
      JSON.stringify({ event: "webhook.metadata.invalid", level: "error", context, issues: parsed.error.issues.map((i) => i.path.join(".")) }),
    )
    throw new Error(`[commerce] invalid checkout metadata (${context})`)
  }
  const m = parsed.data
  return {
    cartToken: m.cartToken,
    holdId: m.holdId ? Number(m.holdId) : null,
    courseId: Number(m.courseId),
    sessionId: m.sessionId ? Number(m.sessionId) : null,
    locale: m.locale,
    quantity: Number(m.quantity),
  }
}

/** Lenient variant for close events (expired / failed): missing metadata → null. */
export function tryParseCheckoutMetadata(metadata: Stripe.Metadata | null | undefined): ParsedMetadata | null {
  const parsed = checkoutMetadataSchema.safeParse(metadata ?? {})
  if (!parsed.success) return null
  return parseCheckoutMetadata(metadata, "lenient")
}

/** Structured log without PII. */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ event, level, ...fields })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}
