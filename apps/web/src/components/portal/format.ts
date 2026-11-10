import type { Locale } from "@/modules/_shared"

const intlLocale = (locale: Locale): string => (locale === "fr" ? "fr-CA" : "en-CA")

/** Order date, studio timezone. No CSS capitalisation: French months stay lowercase. */
export function formatOrderDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso))
}

/** Only http(s) URLs may become the community link (admin-entered text). */
export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

/** Display name for the greeting: first name, else nothing. */
export function greetingName(first: string | null): string | null {
  const name = first?.trim()
  return name ? name : null
}

/** Date + time in the studio timezone (no CSS capitalisation: French stays lowercase). */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "America/Toronto",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso))
}

/** Percent value (0-100) as a localized string, e.g. "100 %" / "100%". */
export function formatPercent(percent: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(percent / 100)
}
