import { createHash } from "node:crypto"
import type { Payload, Where } from "payload"

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
export const EMAIL_LIMIT = 5
export const IP_LIMIT = 20

export type RateScope = "email" | "ip"
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex")

type WindowInput = { scope: RateScope; keyHash: string; limit: number; windowMs: number; now?: Date }

/**
 * Shared core. Record one attempt and decide. Insert-then-count keeps the check
 * race-safe: each request ranks its own row (see below). State lives in Postgres.
 */
async function consumeWindow(payload: Payload, input: WindowInput): Promise<RateLimitDecision> {
  const now = input.now ?? new Date()
  const { scope, keyHash, windowMs } = input
  const windowStart = new Date(now.getTime() - windowMs).toISOString()

  const mine = await payload.create({
    collection: "auth-rate-limits",
    data: { scope, keyHash },
    overrideAccess: true,
  })

  const where: Where = {
    and: [
      { scope: { equals: scope } },
      { keyHash: { equals: keyHash } },
      { createdAt: { greater_than: windowStart } },
    ],
  }
  // Decide by our row's rank (rows in the window with id <= ours), not by the total:
  // under concurrency every caller may see all rows, but ranks are unique, so exactly
  // `limit` attempts are allowed. Sequentially, rank == total, so behaviour is unchanged.
  const { totalDocs: rank } = await payload.count({
    collection: "auth-rate-limits",
    where: { and: [...(where.and as Where[]), { id: { less_than_equal: mine.id } }] },
    overrideAccess: true,
  })
  if (rank <= input.limit) return { allowed: true }

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
  const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000))
  return { allowed: false, retryAfterSeconds }
}

/** Magic-link limiter (1h window, un-namespaced key hash). Behaviour unchanged. */
export async function consumeRateLimit(
  payload: Payload,
  input: { scope: RateScope; key: string; limit: number; now?: Date },
): Promise<RateLimitDecision> {
  return consumeWindow(payload, {
    scope: input.scope,
    keyHash: hashKey(input.key),
    limit: input.limit,
    windowMs: RATE_LIMIT_WINDOW_MS,
    now: input.now,
  })
}

const MAX_WINDOW_SECONDS = 24 * 60 * 60

/**
 * Generic limiter (CCR-W2-2). Namespace is mixed into the hashed key so counts are
 * independent of the magic-link limiter and of other namespaces. `key` is trimmed
 * and lower-cased. `windowSeconds` must be 1..86400 (rows are pruned after 24h).
 */
export async function consumeRateLimitGeneric(
  payload: Payload,
  i: { scope: RateScope; namespace: string; key: string; limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!i.namespace || !i.key.trim()) throw new Error("consumeRateLimit: namespace and key are required")
  if (!Number.isInteger(i.windowSeconds) || i.windowSeconds < 1 || i.windowSeconds > MAX_WINDOW_SECONDS) {
    throw new Error("consumeRateLimit: windowSeconds must be an integer in 1..86400")
  }
  const decision = await consumeWindow(payload, {
    scope: i.scope,
    keyHash: hashKey(`${i.namespace}:${i.key.trim().toLowerCase()}`),
    limit: i.limit,
    windowMs: i.windowSeconds * 1000,
  })
  void pruneRateLimits(payload).catch((error) => console.error("[identity] rate-limit prune failed", error))
  return decision.allowed ? { allowed: true, retryAfterSeconds: 0 } : decision
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
