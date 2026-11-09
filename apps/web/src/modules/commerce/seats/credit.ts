import { randomInt } from "node:crypto"

import { ValidationError } from "payload"
import { z } from "zod"

import type { ID, ISODate, Result, TxContext } from "@/modules/_shared"

import { getPayload } from "../server/payload"
import { fail, idSchema, seatLog, zodFail } from "./shared"

/** Crockford base32 (no I, L, O, U). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const CREDIT_CODE_PREFIX = "CFF-CR-"
export const CREDIT_CODE_PATTERN = /^CFF-CR-[0-9A-HJKMNP-TV-Z]{8}$/
export const CREDIT_VALIDITY_DAYS = 365
const MAX_ATTEMPTS = 3

/** `CFF-CR-` + 8 CSPRNG Crockford chars (~1.1e12 space; the code is the secret). */
export function generateCreditCode(): string {
  let out = CREDIT_CODE_PREFIX
  for (let i = 0; i < 8; i += 1) out += CROCKFORD[randomInt(CROCKFORD.length)]
  return out
}

/**
 * True when `error` is the unique violation on `discount-codes.code`. Payload
 * wraps PG 23505 as a localized ValidationError: detect by column path, never
 * by message text (same rule as access `isUniqueConflict`, PR #7).
 * @internal visible for testing
 */
export function isCodeConflict(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null
  const pg = e?.code === "23505" ? e : e?.cause?.code === "23505" ? e.cause : null
  if (pg) return !pg.constraint || pg.constraint.includes("code")
  if (error instanceof ValidationError || (error instanceof Error && error.name === "ValidationError")) {
    const errors = (error as ValidationError).data?.errors
    return Array.isArray(errors) && errors.length > 0 && errors.every((f) => f?.path === "code")
  }
  return false
}

export type CreatedCredit = { id: ID; code: string; expiresAt: ISODate }

/**
 * Inserts one personal credit row. With `tx`, joins the caller's transaction
 * (the `enqueueDiscountSync` afterChange hook queues `stripe-sync-discount` in
 * the same transaction). A code collision inside a transaction aborts it, so
 * the tx variant does not retry (probability ~1e-12 per code).
 */
export async function insertCreditCode(i: { customerId: number; amount: number; reason: string; tx?: TxContext; now?: Date }): Promise<CreatedCredit> {
  const payload = i.tx?.req.payload ?? (await getPayload())
  const expiresAt = new Date((i.now ?? new Date()).getTime() + CREDIT_VALIDITY_DAYS * 24 * 3600 * 1000).toISOString()
  const code = generateCreditCode()
  const doc = await payload.create({
    collection: "discount-codes",
    data: { code, kind: "amount", value: i.amount, maxRedemptions: 1, expiresAt, active: true, personalFor: i.customerId },
    depth: 0,
    overrideAccess: true,
    req: i.tx?.req,
  })
  seatLog("info", "commerce.credit.issued", { discountCodeId: doc.id, customerId: i.customerId, amount: i.amount, reason: i.reason })
  return { id: doc.id, code, expiresAt }
}

const issueSchema = z.object({
  customerId: idSchema,
  amount: z.number().int().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(500),
})

/**
 * CONTRACT §4 `issueCreditCode` (implemented by W3-09): personal single-use
 * amount code for `customerId`, valid 365 days, mirrored to Stripe by the
 * `stripe-sync-discount` job (no Stripe customer restriction — see sync/discount.ts).
 */
export async function issueCreditCode(i: { customerId: ID; amount: number; reason: string }): Promise<Result<{ code: string }>> {
  const parsed = issueSchema.safeParse(i)
  if (!parsed.success) return zodFail(parsed.error)
  const { customerId, amount, reason } = parsed.data

  const payload = await getPayload()
  const { totalDocs } = await payload.count({ collection: "customers", where: { id: { equals: customerId } }, overrideAccess: true })
  if (totalDocs === 0) return fail({ code: "NOT_FOUND", entity: "customer" })

  for (let attempt = 1; ; attempt += 1) {
    try {
      const created = await insertCreditCode({ customerId, amount, reason })
      return { ok: true, data: { code: created.code } }
    } catch (error) {
      if (!isCodeConflict(error) || attempt >= MAX_ATTEMPTS) throw error
      seatLog("warn", "commerce.credit.code_collision", { attempt })
    }
  }
}
