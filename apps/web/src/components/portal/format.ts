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
