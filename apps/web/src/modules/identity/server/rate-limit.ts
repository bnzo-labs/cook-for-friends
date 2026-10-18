import { createHash } from "node:crypto"
import type { Payload, Where } from "payload"

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
export const EMAIL_LIMIT = 5
export const IP_LIMIT = 20

export type RateScope = "email" | "ip"
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex")

/**
 * Record one attempt and decide. Insert-then-count keeps the check race-safe:
 * concurrent requests each see their own row, so the limit cannot be overshot by
 * more than the in-flight count of a single instant. State lives in Postgres.
 */
export async function consumeRateLimit(
  payload: Payload,
  input: { scope: RateScope; key: string; limit: number; now?: Date },
): Promise<RateLimitDecision> {
  const now = input.now ?? new Date()
  const keyHash = hashKey(input.key)
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString()

  await payload.create({
    collection: "auth-rate-limits",
    data: { scope: input.scope, keyHash },
    overrideAccess: true,
  })

  const where: Where = {
    and: [
      { scope: { equals: input.scope } },
      { keyHash: { equals: keyHash } },
      { createdAt: { greater_than: windowStart } },
    ],
  }
  const { totalDocs } = await payload.count({ collection: "auth-rate-limits", where, overrideAccess: true })
  if (totalDocs <= input.limit) return { allowed: true }

  // Blocked until enough old attempts age out of the window.
  const { docs } = await payload.find({
    collection: "auth-rate-limits",
    where,
    sort: "createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const oldest = docs[0] ? new Date(docs[0].createdAt).getTime() : now.getTime()
  const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now.getTime()) / 1000))
  return { allowed: false, retryAfterSeconds }
}

/** Drop rows older than a day. Cheap, indexed; called opportunistically. */
export async function pruneRateLimits(payload: Payload, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * RATE_LIMIT_WINDOW_MS).toISOString()
  await payload.delete({
    collection: "auth-rate-limits",
    where: { createdAt: { less_than: cutoff } },
    overrideAccess: true,
  })
}
