import { locales } from "@/i18n/locales"
import type { Locale } from "@/modules/_shared"

export const PROFILE_FIELDS = ["firstName", "lastName", "phone", "dietaryNotes", "preferredLocale"] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

export type ProfileFieldError =
  | { code: "too_long"; max: number }
  | { code: "phone_invalid" }
  | { code: "invalid" }

export type ProfileInput = {
  firstName: string
  lastName: string
  phone: string | null
  dietaryNotes: string | null
  preferredLocale: Locale
  marketingConsent: boolean
}

export const LIMITS = { firstName: 100, lastName: 100, phone: 30, dietaryNotes: 500 } as const
/** Digits, spaces and the usual separators; optional leading +. */
const PHONE = /^\+?[0-9][0-9 ().\-]*$/

const text = (data: FormData, key: string): string => {
  const v = data.get(key)
  return typeof v === "string" ? v.trim() : ""
}

/** Pure form-data → patch / field errors. Server action and unit tests share this. */
export function parseProfileForm(
  data: FormData,
): { ok: true; value: ProfileInput } | { ok: false; errors: Partial<Record<ProfileField, ProfileFieldError>> } {
  const errors: Partial<Record<ProfileField, ProfileFieldError>> = {}
  const firstName = text(data, "firstName")
  const lastName = text(data, "lastName")
  const phone = text(data, "phone")
  const dietaryNotes = text(data, "dietaryNotes")
  const rawLocale = text(data, "preferredLocale")

  if (firstName.length > LIMITS.firstName) errors.firstName = { code: "too_long", max: LIMITS.firstName }
  if (lastName.length > LIMITS.lastName) errors.lastName = { code: "too_long", max: LIMITS.lastName }
  if (phone.length > LIMITS.phone) errors.phone = { code: "too_long", max: LIMITS.phone }
  else if (phone && !PHONE.test(phone)) errors.phone = { code: "phone_invalid" }
  if (dietaryNotes.length > LIMITS.dietaryNotes) errors.dietaryNotes = { code: "too_long", max: LIMITS.dietaryNotes }
  const preferredLocale = (locales as readonly string[]).includes(rawLocale) ? (rawLocale as Locale) : null
  if (!preferredLocale) errors.preferredLocale = { code: "invalid" }

  if (Object.keys(errors).length > 0 || !preferredLocale) return { ok: false, errors }
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      phone: phone || null,
      dietaryNotes: dietaryNotes || null,
      preferredLocale,
      // Law 25: consent only when the box is explicitly ticked.
      marketingConsent: data.get("marketingConsent") === "on",
    },
  }
}
