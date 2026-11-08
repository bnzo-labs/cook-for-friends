/**
 * Pure booking-form logic. Mirrors the server rules in
 * modules/commerce/server/validation.ts (checkLineRules + attendeeSchema).
 * Guest names/emails live in component state only: never URL, storage or analytics.
 */

export const MAX_NAME_LENGTH = 100

export type GuestDraft = { firstName: string; lastName: string; email: string }

export const EMPTY_GUEST: GuestDraft = { firstName: "", lastName: "", email: "" }

export type LocalErrorCode =
  | "required"
  | "too_long"
  | "email_invalid"
  | "email_duplicate"
  | "email_required"

/** A field error is either a local rule (i18n `storefront.booking.error_*`) or a server `errors.*` key. */
export type FieldError =
  | { kind: "local"; code: LocalErrorCode }
  | { kind: "server"; key: string }

/** Keys: `email`, `guests.<i>.firstName|lastName|email`. */
export type FieldErrors = Record<string, FieldError>

export type CheckoutBody = {
  lines: Array<{
    courseId: number
    sessionId?: number
    quantity: number
    attendees?: GuestDraft[]
  }>
  locale: "fr" | "en"
  email?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const norm = (s: string): string => s.trim().toLowerCase()

export const guestFieldId = (index: number, field: keyof GuestDraft): string =>
  `guest-${index}-${field}`

export const fieldKeyToId = (key: string): string => {
  const m = /^guests\.(\d+)\.(firstName|lastName|email)$/.exec(key)
  return m ? guestFieldId(Number(m[1]), m[2] as keyof GuestDraft) : "buyer-email"
}

function nameError(value: string): FieldError | null {
  const v = value.trim()
  if (v.length === 0) return { kind: "local", code: "required" }
  if (v.length > MAX_NAME_LENGTH) return { kind: "local", code: "too_long" }
  return null
}

export function validateBooking(input: {
  quantity: number
  buyerEmail: string
  guests: GuestDraft[]
}): FieldErrors {
  const errors: FieldErrors = {}
  const { quantity, buyerEmail } = input
  const buyer = buyerEmail.trim()

  if (buyer.length > 0 && !EMAIL_RE.test(buyer)) {
    errors.email = { kind: "local", code: "email_invalid" }
  } else if (quantity > 1 && buyer.length === 0) {
    errors.email = { kind: "local", code: "email_required" }
  }

  const seen = new Set<string>(buyer && !errors.email ? [norm(buyer)] : [])
  input.guests.slice(0, Math.max(0, quantity - 1)).forEach((g, i) => {
    const first = nameError(g.firstName)
    if (first) errors[`guests.${i}.firstName`] = first
    const last = nameError(g.lastName)
    if (last) errors[`guests.${i}.lastName`] = last

    const email = g.email.trim()
    if (email.length === 0) errors[`guests.${i}.email`] = { kind: "local", code: "required" }
    else if (!EMAIL_RE.test(email)) errors[`guests.${i}.email`] = { kind: "local", code: "email_invalid" }
    else if (seen.has(norm(email))) errors[`guests.${i}.email`] = { kind: "local", code: "email_duplicate" }
    if (email && EMAIL_RE.test(email)) seen.add(norm(email))
  })
  return errors
}

/** `attendees` omitted when N = 1; `email` omitted when empty. */
export function buildCheckoutBody(input: {
  courseId: number
  sessionId: number | null
  quantity: number
  buyerEmail: string
  guests: GuestDraft[]
  locale: "fr" | "en"
}): CheckoutBody {
  const email = input.buyerEmail.trim()
  const attendees = input.guests.slice(0, input.quantity - 1).map((g) => ({
    firstName: g.firstName.trim(),
    lastName: g.lastName.trim(),
    email: g.email.trim(),
  }))
  return {
    lines: [
      {
        courseId: input.courseId,
        ...(input.sessionId !== null ? { sessionId: input.sessionId } : {}),
        quantity: input.quantity,
        ...(input.quantity > 1 ? { attendees } : {}),
      },
    ],
    locale: input.locale,
    ...(email ? { email } : {}),
  }
}

/** Server issue path → form field key, or null when it has no matching field. */
export function issuePathToFieldKey(path: string): string | null {
  if (path === "email") return "email"
  const m = /^lines\.0\.attendees\.(\d+)\.(firstName|lastName|email)$/.exec(path)
  return m ? `guests.${m[1]}.${m[2]}` : null
}

export function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(1, Math.floor(value)), Math.max(1, max))
}
