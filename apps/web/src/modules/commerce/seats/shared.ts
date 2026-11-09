import { z } from "zod"

import type { ModuleError, Result } from "@/modules/_shared"
import type { Order } from "@/payload-types"

export const fail = (error: ModuleError): Result<never> => ({ ok: false, error })

export const zodFail = (error: z.ZodError): Result<never> =>
  fail({ code: "VALIDATION", issues: error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) })

export const invalid = (path: string, message: string): Result<never> => fail({ code: "VALIDATION", issues: [{ path, message }] })

/** Payload id on Postgres: positive integer, number or numeric string. */
export const idSchema = z.union([z.number().int().positive(), z.string().regex(/^\d{1,12}$/)]).transform(Number)

/** Σ of recorded refunds linked to one enrollment (`orders.refunds[].enrollment`, CCR-W2-6). */
export function refundedForEnrollment(order: Pick<Order, "refunds">, enrollmentId: number): number {
  return (order.refunds ?? [])
    .filter((r) => relNum(r.enrollment) === enrollmentId)
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
}

export const relNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "object") return Number((v as { id: unknown }).id)
  return Number(v)
}

/** Structured log, no PII. */
export function seatLog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ event, level, ...fields })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}
