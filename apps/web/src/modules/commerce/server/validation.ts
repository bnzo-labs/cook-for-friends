import { z } from "zod"

import { locales } from "@/i18n/locales"
import type { CourseFormat, ModuleError, Result } from "@/modules/_shared"

/** Hard cap on seats per purchase, whatever staff set (CONTRACT §3.1, Q10). */
export const HARD_MAX_SEATS = 10

/** Issue message keys (localized under `errors.*`). */
export const MSG = {
  CART_SINGLE_LINE: "errors.CART_SINGLE_LINE",
  QUANTITY_OUT_OF_RANGE: "errors.QUANTITY_OUT_OF_RANGE",
  BUYER_EMAIL_REQUIRED: "errors.BUYER_EMAIL_REQUIRED",
  ATTENDEES_MISMATCH: "errors.ATTENDEES_MISMATCH",
  ATTENDEE_EMAIL_DUPLICATE: "errors.ATTENDEE_EMAIL_DUPLICATE",
  SESSION_REQUIRED: "errors.SESSION_REQUIRED",
  SESSION_NOT_ALLOWED: "errors.SESSION_NOT_ALLOWED",
  SESSION_INVALID: "errors.SESSION_INVALID",
  CART_TOKEN_INVALID: "errors.CART_TOKEN_INVALID",
} as const

export type Issue = { path: string; message: string }

const idSchema = z.union([
  z.number().int().positive(),
  z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .transform(Number),
])
const nameSchema = z.string().trim().min(1).max(100)
const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const attendeeSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
})

const quantitySchema = z
  .number({ invalid_type_error: MSG.QUANTITY_OUT_OF_RANGE, required_error: MSG.QUANTITY_OUT_OF_RANGE })
  .int(MSG.QUANTITY_OUT_OF_RANGE)
  .min(1, MSG.QUANTITY_OUT_OF_RANGE)
  .max(HARD_MAX_SEATS, MSG.QUANTITY_OUT_OF_RANGE)

export const cartLineSchema = z.object({
  courseId: idSchema,
  sessionId: idSchema.optional(),
  quantity: quantitySchema,
  attendees: z.array(attendeeSchema).max(HARD_MAX_SEATS - 1, MSG.ATTENDEES_MISMATCH).optional(),
})

/** Paths mirror the HTTP body (`lines.0.attendees.1.email`) so the UI can mark the right field. */
export const checkoutInputSchema = z.object({
  lines: z.array(cartLineSchema).length(1, MSG.CART_SINGLE_LINE),
  locale: z.enum(locales),
  email: emailSchema.optional(),
})

export type CheckoutInput = z.infer<typeof checkoutInputSchema>
export type ParsedLine = CheckoutInput["lines"][number]

const CART_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

export function isCartToken(value: unknown): value is string {
  return typeof value === "string" && CART_TOKEN_RE.test(value)
}

export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
}

export function validationError(issues: Issue[]): Result<never> {
  return { ok: false, error: { code: "VALIDATION", issues } }
}

export function moduleError(error: ModuleError): Result<never> {
  return { ok: false, error }
}

/** Effective max: staff setting clamped to 1..HARD_MAX_SEATS. */
export function effectiveMaxSeats(setting: number): number {
  if (!Number.isFinite(setting)) return 1
  return Math.min(HARD_MAX_SEATS, Math.max(1, Math.floor(setting)))
}

const norm = (email: string) => email.trim().toLowerCase()

/**
 * D9 multi-seat rules (CONTRACT §4 createCheckout). Pure: runs before any lock.
 * Online: no session, quantity 1, no attendees. In-person: session required,
 * quantity 1..max, buyer email when N > 1, attendees = N − 1, guest emails
 * distinct from each other and from the buyer (case-insensitive, trimmed).
 */
export function checkLineRules(
  input: Pick<CheckoutInput, "lines" | "email">,
  format: CourseFormat,
  maxSeatsSetting: number,
): Issue[] {
  const line = input.lines[0]
  if (!line) return [{ path: "lines", message: MSG.CART_SINGLE_LINE }]
  const issues: Issue[] = []
  const attendees = line.attendees ?? []
  const n = line.quantity

  if (format === "online") {
    if (line.sessionId !== undefined) issues.push({ path: "lines.0.sessionId", message: MSG.SESSION_NOT_ALLOWED })
    if (n !== 1) issues.push({ path: "lines.0.quantity", message: MSG.QUANTITY_OUT_OF_RANGE })
    if (attendees.length > 0) issues.push({ path: "lines.0.attendees", message: MSG.ATTENDEES_MISMATCH })
    return issues
  }

  if (line.sessionId === undefined) issues.push({ path: "lines.0.sessionId", message: MSG.SESSION_REQUIRED })
  if (n > effectiveMaxSeats(maxSeatsSetting)) {
    issues.push({ path: "lines.0.quantity", message: MSG.QUANTITY_OUT_OF_RANGE })
    return issues
  }
  if (n > 1 && !input.email) issues.push({ path: "email", message: MSG.BUYER_EMAIL_REQUIRED })
  if (attendees.length !== n - 1) {
    issues.push({ path: "lines.0.attendees", message: MSG.ATTENDEES_MISMATCH })
    return issues
  }

  const seen = new Set<string>(input.email ? [norm(input.email)] : [])
  attendees.forEach((a, i) => {
    const key = norm(a.email)
    if (seen.has(key)) issues.push({ path: `lines.0.attendees.${i}.email`, message: MSG.ATTENDEE_EMAIL_DUPLICATE })
    seen.add(key)
  })
  return issues
}
